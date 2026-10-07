/**
 * KAPWA Hospitality OS — Standalone Browser Client
 *
 * Standalone browser client that communicates directly
 * with the KAPWA Node/Express + Neon PostgreSQL backend (`/api/db`, `/api/rpc`,
 * `/api/functions`, `/api/storage`, `/api/realtime`).
 */

import { getStaffToken, getStaffSession, clearStaffSession } from '@/lib/session';

const API_BASE = (import.meta.env.VITE_KAPWA_API_URL || '').replace(/\/$/, '');

export function getKapwaApiBase(): string {
  return API_BASE;
}

function buildAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders || {}),
  };
  const staffToken = getStaffToken();
  if (staffToken && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${staffToken}`;
  }
  return headers;
}

export interface KapwaResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string; details?: any } | null;
  count?: number | null;
}

class KapwaQueryBuilder<T = any> implements PromiseLike<KapwaResponse<T>> {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectColumns = '*';
  private selectCount: string | null = null;
  private head = false;
  private values: any = null;
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private filters: Array<{ op: string; column?: string; value?: any; operator?: string; expr?: string }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private rangeBounds: { from: number; to: number } | null = null;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private returnRepresentation = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    if (this.action === 'select') {
      this.selectColumns = columns || '*';
      if (opts?.count) this.selectCount = opts.count;
      if (opts?.head) this.head = true;
    } else {
      this.selectColumns = columns || '*';
      this.returnRepresentation = true;
    }
    return this;
  }

  insert(values: any, opts?: { count?: string }) {
    this.action = 'insert';
    this.values = values;
    if (opts?.count) this.selectCount = opts.count;
    return this;
  }

  update(values: any, opts?: { count?: string }) {
    this.action = 'update';
    this.values = values;
    if (opts?.count) this.selectCount = opts.count;
    return this;
  }

  upsert(values: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: string }) {
    this.action = 'upsert';
    this.values = values;
    if (opts?.onConflict) this.onConflict = opts.onConflict;
    if (opts?.ignoreDuplicates) this.ignoreDuplicates = true;
    if (opts?.count) this.selectCount = opts.count;
    return this;
  }

  delete(opts?: { count?: string }) {
    this.action = 'delete';
    if (opts?.count) this.selectCount = opts.count;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ op: 'gt', column, value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  like(column: string, value: string) {
    this.filters.push({ op: 'like', column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ op: 'ilike', column, value });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ op: 'is', column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }

  not(column: string, operator: string, value: any) {
    this.filters.push({ op: 'not', column, operator, value });
    return this;
  }

  or(expr: string) {
    this.filters.push({ op: 'or', expr });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = { from, to };
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  private async execute(): Promise<KapwaResponse<T>> {
    try {
      const response = await fetch(`${API_BASE}/api/db`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          select: this.selectColumns,
          count: this.selectCount,
          head: this.head,
          values: this.values,
          onConflict: this.onConflict,
          ignoreDuplicates: this.ignoreDuplicates,
          filters: this.filters,
          orders: this.orders,
          limit: this.limitCount,
          range: this.rangeBounds,
          singleMode: this.singleMode,
          returning: this.returnRepresentation,
        }),
      });

      const json = await response.json().catch(() => ({
        data: null,
        error: { message: `HTTP ${response.status}` },
      }));

      return {
        data: json.data ?? null,
        error: json.error ?? null,
        count: json.count ?? null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || 'Network error communicating with KAPWA backend' },
      };
    }
  }

  then<TResult1 = KapwaResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: KapwaResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<KapwaResponse<T> | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<KapwaResponse<T>> {
    return this.execute().finally(onfinally);
  }
}

// ── Realtime Channel Hub (SSE) ──────────────────────────────────────────────
type RealtimeFilter = {
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE' | string;
  schema?: string;
  table?: string;
  filter?: string;
};

type RealtimeListener = {
  filter: RealtimeFilter;
  callback: (payload: any) => void;
};

let sharedEventSource: EventSource | null = null;
const activeChannels = new Set<KapwaRealtimeChannel>();

function parseSimpleFilter(filterExpr?: string): { column: string; value: string } | null {
  if (!filterExpr) return null;
  const m = String(filterExpr).match(/^([a-zA-Z0-9_]+)=eq\.(.+)$/);
  if (!m) return null;
  return { column: m[1], value: m[2] };
}

function ensureSharedEventSource() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  if (sharedEventSource) return;

  try {
    sharedEventSource = new EventSource(`${API_BASE}/api/realtime`);
    sharedEventSource.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type !== 'postgres_changes') return;
        for (const ch of activeChannels) {
          ch.dispatchMessage(msg);
        }
      } catch {
        // Ignore non-JSON or heartbeat messages
      }
    };
    sharedEventSource.onerror = () => {
      // Browser EventSource automatically reconnects
    };
  } catch {
    sharedEventSource = null;
  }
}

class KapwaRealtimeChannel {
  public topic: string;
  private listeners: RealtimeListener[] = [];

  constructor(name: string) {
    this.topic = name;
  }

  on(
    type: string,
    filter: RealtimeFilter,
    callback: (payload: any) => void,
  ): KapwaRealtimeChannel {
    if (type === 'postgres_changes') {
      this.listeners.push({ filter: filter || {}, callback });
    }
    return this;
  }

  subscribe(statusCb?: (status: string) => void): KapwaRealtimeChannel {
    activeChannels.add(this);
    ensureSharedEventSource();
    if (typeof statusCb === 'function') {
      queueMicrotask(() => statusCb('SUBSCRIBED'));
    }
    return this;
  }

  unsubscribe(): Promise<'ok'> {
    activeChannels.delete(this);
    if (activeChannels.size === 0 && sharedEventSource) {
      sharedEventSource.close();
      sharedEventSource = null;
    }
    return Promise.resolve('ok');
  }

  dispatchMessage(msg: any) {
    for (const listener of this.listeners) {
      const f = listener.filter;
      if (f.table && f.table !== '*' && f.table !== msg.table) continue;
      if (f.event && f.event !== '*' && f.event.toUpperCase() !== String(msg.eventType || '').toUpperCase()) {
        continue;
      }
      const parsedFilter = parseSimpleFilter(f.filter);
      if (parsedFilter) {
        const row = msg.new || msg.old || {};
        if (String(row[parsedFilter.column] ?? '') !== parsedFilter.value) {
          continue;
        }
      }
      try {
        listener.callback(msg);
      } catch (err) {
        console.error('[kapwa-realtime] listener error:', err);
      }
    }
  }
}

// ── File / Blob Base64 Helper ───────────────────────────────────────────────
async function toBase64String(input: Blob | File | ArrayBuffer | Uint8Array | string): Promise<{ base64: string; contentType?: string }> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return { base64: input };
    }
    return { base64: btoa(unescape(encodeURIComponent(input))), contentType: 'text/plain' };
  }

  let arrayBuffer: ArrayBuffer;
  let contentType: string | undefined;

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    contentType = input.type || undefined;
    arrayBuffer = await input.arrayBuffer();
  } else if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else if (ArrayBuffer.isView(input)) {
    arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  } else {
    throw new Error('Unsupported upload file type');
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return { base64: btoa(binary), contentType };
}

// ── Standalone KAPWA Client Instance ────────────────────────────────────────
export const kapwaClient = {
  from<T = any>(table: string) {
    return new KapwaQueryBuilder<T>(table);
  },

  async rpc<T = any>(fnName: string, params: Record<string, any> = {}): Promise<KapwaResponse<T>> {
    try {
      const response = await fetch(`${API_BASE}/api/rpc/${encodeURIComponent(fnName)}`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify(params || {}),
      });
      const json = await response.json().catch(() => ({
        data: null,
        error: { message: `HTTP ${response.status}` },
      }));
      return { data: json.data ?? null, error: json.error ?? null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'RPC call failed' } };
    }
  },

  functions: {
    async invoke<T = any>(
      fnName: string,
      options?: { body?: any; headers?: Record<string, string>; method?: string },
    ): Promise<{ data: T | null; error: any }> {
      try {
        const response = await fetch(`${API_BASE}/api/functions/${encodeURIComponent(fnName)}`, {
          method: options?.method || 'POST',
          headers: buildAuthHeaders(options?.headers),
          body: options?.body !== undefined ? JSON.stringify(options.body) : JSON.stringify({}),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          return {
            data: payload,
            error: {
              message: payload?.error || `Function ${fnName} failed with status ${response.status}`,
              status: response.status,
              context: response,
            },
          };
        }
        return { data: payload as T, error: null };
      } catch (err: any) {
        return {
          data: null,
          error: { message: err?.message || `Failed to invoke function ${fnName}` },
        };
      }
    },
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          fileBody: Blob | File | ArrayBuffer | Uint8Array | string,
          opts?: { upsert?: boolean; contentType?: string; cacheControl?: string },
        ) {
          try {
            const { base64, contentType } = await toBase64String(fileBody);
            const response = await fetch(`${API_BASE}/api/storage/${encodeURIComponent(bucket)}/upload`, {
              method: 'POST',
              headers: buildAuthHeaders(),
              body: JSON.stringify({
                path,
                contentBase64: base64,
                contentType: opts?.contentType || contentType,
                upsert: opts?.upsert ?? false,
              }),
            });
            const json = await response.json();
            return { data: json.data ?? null, error: json.error ?? null };
          } catch (err: any) {
            return { data: null, error: { message: err?.message || 'Storage upload failed' } };
          }
        },

        getPublicUrl(path: string) {
          const cleanPath = String(path || '').replace(/^\/+/, '');
          return {
            data: {
              publicUrl: `${API_BASE}/api/storage/public/${encodeURIComponent(bucket)}/${cleanPath}`,
            },
          };
        },

        async remove(paths: string[]) {
          try {
            const response = await fetch(`${API_BASE}/api/storage/${encodeURIComponent(bucket)}/remove`, {
              method: 'POST',
              headers: buildAuthHeaders(),
              body: JSON.stringify({ paths }),
            });
            const json = await response.json();
            return { data: json.data ?? null, error: json.error ?? null };
          } catch (err: any) {
            return { data: null, error: { message: err?.message || 'Storage remove failed' } };
          }
        },
      };
    },
  },

  channel(name: string) {
    return new KapwaRealtimeChannel(name);
  },

  removeChannel(channel: KapwaRealtimeChannel | null | undefined) {
    if (channel && typeof channel.unsubscribe === 'function') {
      return channel.unsubscribe();
    }
    return Promise.resolve('ok');
  },

  auth: {
    async getSession() {
      const session = getStaffSession();
      if (!session?.token) return { data: { session: null }, error: null };
      return {
        data: {
          session: {
            access_token: session.token,
            user: {
              id: session.employeeId,
              user_metadata: { name: session.name, permissions: session.permissions, is_admin: session.isAdmin },
            },
          },
        },
        error: null,
      };
    },
    async getUser() {
      const session = getStaffSession();
      if (!session) return { data: { user: null }, error: null };
      return {
        data: {
          user: {
            id: session.employeeId,
            user_metadata: { name: session.name, permissions: session.permissions, is_admin: session.isAdmin },
          },
        },
        error: null,
      };
    },
    onAuthStateChange(callback: (event: string, session: any) => void) {
      return {
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      };
    },
    async signOut() {
      clearStaffSession();
      return { error: null };
    },
  },
};
