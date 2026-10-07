/**
 * KAPWA Hospitality OS — Independent Realtime Hub (Server-Sent Events)
 *
 * Replaces Supabase Realtime (`supabase.channel(...).on('postgres_changes', ...)`).
 * Broadcasts database mutation events (`INSERT`, `UPDATE`, `DELETE`) over SSE
 * to all connected browser clients.
 */

const clients = new Set();

export function handleRealtimeStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`);
  clients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(keepAlive);
      clients.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

export function broadcastDbChange({
  table,
  schema = 'public',
  eventType = 'UPDATE',
  new: newRow = null,
  old: oldRow = null,
}) {
  if (!table || clients.size === 0) return;
  const payload = JSON.stringify({
    type: 'postgres_changes',
    schema,
    table,
    eventType,
    new: newRow,
    old: oldRow,
    commit_timestamp: new Date().toISOString(),
  });

  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}
