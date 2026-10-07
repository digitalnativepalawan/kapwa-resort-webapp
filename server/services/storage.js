/**
 * KAPWA Hospitality OS — Independent File Storage Service
 *
 * Replaces KAPWA Storage (`db.storage.from(bucket).upload / getPublicUrl / remove`).
 * Stores files on local disk under `server/storage/<bucket>/<path>` (configurable via
 * `KAPWA_STORAGE_DIR`) and serves public assets at `/api/storage/public/:bucket/*`.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = resolve(process.env.KAPWA_STORAGE_DIR || join(__dirname, '..', 'storage'));

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

function resolveSafeFilePath(bucket, objectPath) {
  const cleanBucket = String(bucket || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanBucket) throw new Error('Invalid storage bucket name');
  const cleanRel = normalize(String(objectPath || '').replace(/^\/+/, '')).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!cleanRel) throw new Error('Invalid storage object path');
  const bucketDir = resolve(STORAGE_ROOT, cleanBucket);
  const fullPath = resolve(bucketDir, cleanRel);
  if (!fullPath.startsWith(bucketDir)) {
    throw new Error('Path traversal is not permitted');
  }
  return { cleanBucket, cleanRel, fullPath };
}

export async function handleStorageUpload(req, res) {
  try {
    const { bucket } = req.params;
    const { path: objectPath, contentBase64, contentType } = req.body || {};
    if (!objectPath || typeof contentBase64 !== 'string') {
      return res.status(400).json({ error: { message: 'path and contentBase64 are required' } });
    }

    const { cleanBucket, cleanRel, fullPath } = resolveSafeFilePath(bucket, objectPath);
    await mkdir(dirname(fullPath), { recursive: true });

    const base64Clean = contentBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    await writeFile(fullPath, buffer);

    if (contentType) {
      await writeFile(`${fullPath}.meta.json`, JSON.stringify({ contentType }), 'utf8').catch(() => {});
    }

    return res.json({
      data: {
        path: cleanRel,
        fullPath: `${cleanBucket}/${cleanRel}`,
        publicUrl: `/api/storage/public/${cleanBucket}/${cleanRel}`,
      },
      error: null,
    });
  } catch (err) {
    return res.status(400).json({ data: null, error: { message: err.message || 'Storage upload failed' } });
  }
}

export async function handleStorageRemove(req, res) {
  try {
    const { bucket } = req.params;
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
    const removed = [];
    for (const p of paths) {
      try {
        const { cleanRel, fullPath } = resolveSafeFilePath(bucket, p);
        await rm(fullPath, { force: true });
        await rm(`${fullPath}.meta.json`, { force: true });
        removed.push(cleanRel);
      } catch {
        // Ignore missing files
      }
    }
    return res.json({ data: removed, error: null });
  } catch (err) {
    return res.status(400).json({ data: null, error: { message: err.message || 'Storage remove failed' } });
  }
}

export async function handleStoragePublicServe(req, res) {
  try {
    const { bucket } = req.params;
    const rawParam = req.params.objectPath ?? req.params[0] ?? '';
    const wildcardPath = Array.isArray(rawParam) ? rawParam.join('/') : String(rawParam);
    const { fullPath } = resolveSafeFilePath(bucket, wildcardPath);

    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    let contentType = MIME_TYPES[extname(fullPath).toLowerCase()] || 'application/octet-stream';
    try {
      const meta = JSON.parse(await readFile(`${fullPath}.meta.json`, 'utf8'));
      if (meta?.contentType) contentType = meta.contentType;
    } catch {
      // No meta sidecar
    }

    const data = await readFile(fullPath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(data);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not serve file' });
  }
}
