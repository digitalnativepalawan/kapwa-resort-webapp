import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConfiguredModel } from './lib/model-runtime.js';
import { createResortOperatorAgent } from './agent/resort-operator.js';
import { executeQuery, executeRpc, getDbStatus } from './db/adapter.js';
import { attachIdentity, checkTablePermission, sanitizeTableResult } from './middleware/permissions.js';
import { handleRealtimeStream, broadcastDbChange } from './services/realtime.js';
import { handleStorageUpload, handleStorageRemove, handleStoragePublicServe } from './services/storage.js';
import { createFunctionDispatcher } from './services/functions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const SETTINGS_FILE = join(DATA_DIR, 'agent-settings.json');
const RUNS_FILE = join(DATA_DIR, 'operator-runs.json');

const DEFAULT_SETTINGS = {
  enabled: true,
  provider_type: 'ollama',
  base_url: 'http://127.0.0.1:11434',
  api_key: '',
  model_name: 'qwen2.5:3b',
  temperature: 0.2,
  max_tokens: 500,
};

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadSettings() {
  await ensureDataDir();
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    await writeFile(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(next) {
  await ensureDataDir();
  const current = await loadSettings();
  const merged = {
    ...current,
    ...next,
    api_key:
      next.api_key === undefined || next.api_key === '••••••••'
        ? current.api_key
        : next.api_key,
  };
  await writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

function sanitizeSettings(s) {
  return {
    ...s,
    api_key_set: Boolean(s.api_key && s.api_key.length > 0),
    api_key: s.api_key ? '••••••••' : '',
  };
}

async function loadRuns() {
  await ensureDataDir();
  try {
    const raw = await readFile(RUNS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { runs: [], actions: [] };
  }
}

async function saveRuns(state) {
  await ensureDataDir();
  const trimmed = {
    runs: (state.runs || []).slice(0, 50),
    actions: (state.actions || []).slice(0, 200),
  };
  await writeFile(RUNS_FILE, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(attachIdentity);

const { dispatchFunction, db: internalDb } = createFunctionDispatcher({
  onMutation: broadcastDbChange,
});

const operatorAgent = createResortOperatorAgent({
  runConfiguredModel,
  db: internalDb,
});

// ── Health & Diagnostics ────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const settings = await loadSettings();
  const dbStatus = await getDbStatus();
  res.json({
    ok: true,
    service: 'kapwa-os-standalone',
    enabled: settings.enabled,
    provider_type: settings.provider_type,
    model_name: settings.model_name,
    db: dbStatus,
  });
});

app.get('/api/auth/probe', (req, res) => {
  if (!req.staffClaims) {
    return res.status(401).json({ ok: false, error: 'Invalid or missing staff JWT' });
  }
  return res.json({ ok: true, claims: req.staffClaims });
});

// ── Database Query & RPC Endpoints (Neon PostgreSQL / Embedded Store) ───────
app.post('/api/db', async (req, res) => {
  try {
    const descriptor = req.body || {};
    const { table, action = 'select' } = descriptor;
    if (!table) {
      return res.status(400).json({ data: null, error: { message: 'table is required' } });
    }

    const perm = checkTablePermission({
      table,
      action,
      claims: req.staffClaims,
      isInternal: req.isInternal,
    });
    if (!perm.allowed) {
      return res.status(perm.status || 403).json({
        data: null,
        error: { message: perm.error || 'Permission denied', code: '42501' },
      });
    }

    const result = await executeQuery(descriptor, {
      claims: req.staffClaims,
      onMutation: broadcastDbChange,
    });

    if (!result.error && action !== 'select') {
      broadcastDbChange({
        table,
        eventType: action === 'delete' ? 'DELETE' : action === 'update' ? 'UPDATE' : 'INSERT',
        new: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
      });
    }

    const sanitizedData = sanitizeTableResult(table, result.data, {
      claims: req.staffClaims,
      isInternal: req.isInternal,
    });

    return res.json({
      data: sanitizedData,
      error: result.error || null,
      count: result.count ?? null,
    });
  } catch (err) {
    return res.status(500).json({
      data: null,
      error: { message: err.message || 'Database query error' },
    });
  }
});

app.post('/api/rpc/:fnName', async (req, res) => {
  try {
    const result = await executeRpc(req.params.fnName, req.body || {}, {
      claims: req.staffClaims,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      data: null,
      error: { message: err.message || 'RPC execution failed' },
    });
  }
});

// ── Realtime (SSE) ──────────────────────────────────────────────────────────
app.get('/api/realtime', handleRealtimeStream);

// ── Storage Endpoints ───────────────────────────────────────────────────────
app.post('/api/storage/:bucket/upload', handleStorageUpload);
app.post('/api/storage/:bucket/remove', handleStorageRemove);
app.get('/api/storage/public/:bucket/*objectPath', handleStoragePublicServe);

// ── Standalone Functions (/api/functions/:name and /functions/v1/:name) ─────
async function handleFunctionRequest(req, res) {
  try {
    const name = req.params.name;
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local';
    const result = await dispatchFunction(name, {
      method: req.method,
      body: req.body || {},
      query: req.query || {},
      headers: req.headers || {},
      claims: req.staffClaims,
      isInternal: req.isInternal,
      clientIp: String(clientIp),
    });
    return res.status(result.status || 200).json(result.payload);
  } catch (err) {
    console.error(`[functions/${req.params.name}] error:`, err);
    return res.status(500).json({ error: err.message || 'Internal service error' });
  }
}

app.all('/api/functions/:name', handleFunctionRequest);
app.all('/functions/v1/:name', handleFunctionRequest);

// ── Legacy / Direct Agent Settings & Operator Routes ────────────────────────
app.get('/api/agent/settings', async (_req, res) => {
  const settings = await loadSettings();
  res.json(sanitizeSettings(settings));
});

app.put('/api/agent/settings', async (req, res) => {
  try {
    const updated = await saveSettings(req.body || {});
    res.json(sanitizeSettings(updated));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to save settings' });
  }
});

app.post('/api/agent/test', async (req, res) => {
  try {
    const saved = await loadSettings();
    const override = req.body || {};
    const cfg = {
      ...saved,
      ...override,
      api_key:
        override.api_key && override.api_key !== '••••••••'
          ? override.api_key
          : saved.api_key,
    };
    const result = await runConfiguredModel(cfg, [{ role: 'user', content: 'Respond with OK.' }]);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err.message || 'Model connection failed',
    });
  }
});

app.post('/api/agent/guest-chat', async (req, res) => {
  try {
    const settings = await loadSettings();
    if (!settings.enabled) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        error: 'Assistant is temporarily disabled by resort management.',
      });
    }
    const { messages, systemPrompt } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages[] is required' });
    }
    const fullMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const result = await runConfiguredModel(settings, fullMessages);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err.message || 'Assistant is temporarily unavailable.',
    });
  }
});

app.get('/api/agent/operator/status', async (_req, res) => {
  const store = await loadRuns();
  const settings = await loadSettings();
  res.json({
    enabled: settings.enabled,
    provider_type: settings.provider_type,
    model_name: settings.model_name,
    latest_run: store.runs[0] || null,
    runs: store.runs.slice(0, 10),
    pending_actions: store.actions.filter((a) => a.status === 'proposed'),
    recent_actions: store.actions.slice(0, 30),
  });
});

app.post('/api/agent/operator/run', async (req, res) => {
  try {
    const settings = await loadSettings();
    const { type = 'daily', question, useLLM = true } = req.body || {};
    const runResult = await operatorAgent.runCycle(settings, {
      type,
      question,
      useLLM: settings.enabled && useLLM,
    });
    const store = await loadRuns();
    store.runs.unshift(runResult);
    const existingKeys = new Set(
      store.actions
        .filter((a) => a.status === 'proposed')
        .map((a) => `${a.action_type}:${a.target_id}`),
    );
    for (const a of runResult.proposed_actions || []) {
      const key = `${a.action_type}:${a.target_id}`;
      if (!existingKeys.has(key)) {
        store.actions.unshift(a);
        existingKeys.add(key);
      }
    }
    await saveRuns(store);
    res.json(runResult);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Operator run failed' });
  }
});

app.post('/api/agent/operator/actions/:id/decide', async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, actor = 'admin' } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ ok: false, error: 'decision must be approve or reject' });
    }
    const store = await loadRuns();
    const action = store.actions.find((a) => a.id === id);
    if (!action) {
      return res.status(404).json({ ok: false, error: 'Action not found' });
    }
    if (action.status !== 'proposed') {
      return res.status(409).json({ ok: false, error: `Action already ${action.status}` });
    }

    action.decided_by = actor;
    action.decided_at = new Date().toISOString();

    if (decision === 'reject') {
      action.status = 'rejected';
      await saveRuns(store);
      return res.json({ ok: true, action });
    }

    const execResult = await operatorAgent.executeAction(action, actor);
    action.status = execResult.ok ? 'executed' : 'failed';
    action.execution_result = execResult;
    await saveRuns(store);
    res.json({ ok: execResult.ok, action, result: execResult });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Decision failed' });
  }
});

cron.schedule('0 7 * * *', async () => {
  try {
    const settings = await loadSettings();
    const run = await operatorAgent.runCycle(settings, { type: 'morning', useLLM: settings.enabled });
    const store = await loadRuns();
    store.runs.unshift(run);
    await saveRuns(store);
    console.log('[kapwa-operator] Morning brief generated');
  } catch (err) {
    console.error('[kapwa-operator] Morning cron failed:', err.message);
  }
});

cron.schedule('0 19 * * *', async () => {
  try {
    const settings = await loadSettings();
    const run = await operatorAgent.runCycle(settings, { type: 'evening', useLLM: settings.enabled });
    const store = await loadRuns();
    store.runs.unshift(run);
    await saveRuns(store);
    console.log('[kapwa-operator] Evening brief generated');
  } catch (err) {
    console.error('[kapwa-operator] Evening cron failed:', err.message);
  }
});

const PORT = Number(process.env.PORT || process.env.AGENT_SERVER_PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, async () => {
  const dbStatus = await getDbStatus();
  console.log(`[kapwa-os-server] listening on http://${HOST}:${PORT} (db: ${dbStatus.backend})`);
});
