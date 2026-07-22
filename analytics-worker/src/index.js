import { DASHBOARD_HTML } from './dashboard.js';

const EVENTS = new Set(['page_view', 'zip_accepted', 'archive_rejected', 'model_opened', 'model_failed']);
const SCHEMAS = new Set(['AP203', 'AP214', 'AP242', 'Other', 'Unknown', 'None']);
const FAILURES = new Set(['none', 'encrypted', 'compression', 'zip64', 'no_step', 'no_geometry', 'parse_failed', 'size_limit', 'archive_invalid', 'unknown']);

export function normalizeEvent(input) {
  if (!input || !EVENTS.has(input.event)) return null;
  const session = String(input.session ?? '');
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(session)) return null;
  return {
    event: input.event,
    schema: SCHEMAS.has(input.schema) ? input.schema : 'None',
    failure: FAILURES.has(input.failure) ? input.failure : 'none',
    session
  };
}

export function isAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGIN ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return Boolean(origin && allowed.includes(origin));
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ''));
  const b = new TextEncoder().encode(String(right ?? ''));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recordEvent(request, env) {
  if (!isAllowedOrigin(request, env)) return json({ error: 'Origin not allowed' }, 403);
  if (!env.DB || !env.ANALYTICS_SALT) return json({ error: 'Analytics is not configured' }, 503, corsHeaders(request));
  let payload;
  try {
    const rawPayload = await request.text();
    if (new TextEncoder().encode(rawPayload).byteLength > 4096) {
      return json({ error: 'Payload too large' }, 413, corsHeaders(request));
    }
    payload = normalizeEvent(JSON.parse(rawPayload));
  } catch {
    payload = null;
  }
  if (!payload) return json({ error: 'Invalid event' }, 400, corsHeaders(request));

  const now = new Date();
  const timestamp = now.toISOString();
  const day = timestamp.slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const agent = request.headers.get('User-Agent') ?? 'unknown';
  const sessionHash = await sha256(`${env.ANALYTICS_SALT}|session|${payload.session}`);
  const visitorHash = await sha256(`${env.ANALYTICS_SALT}|visitor|${day}|${ip}|${agent}`);

  const receipt = await env.DB.prepare(`
    INSERT OR IGNORE INTO event_receipts
      (day, session_hash, event_type, step_schema, failure_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(day, sessionHash, payload.event, payload.schema, payload.failure, timestamp).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO daily_visitors (day, visitor_hash, created_at)
    VALUES (?, ?, ?)
  `).bind(day, visitorHash, timestamp).run();

  if ((receipt.meta?.changes ?? 0) > 0) {
    await env.DB.prepare(`
      INSERT INTO usage_totals
        (day, event_type, step_schema, failure_code, event_count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT (day, event_type, step_schema, failure_code)
      DO UPDATE SET event_count = event_count + 1, updated_at = excluded.updated_at
    `).bind(day, payload.event, payload.schema, payload.failure, timestamp).run();
  }

  return json({ accepted: true, deduplicated: (receipt.meta?.changes ?? 0) === 0 }, 202, corsHeaders(request));
}

async function readStats(request, env) {
  const authorization = request.headers.get('Authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!env.ADMIN_TOKEN || !constantTimeEqual(suppliedToken, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database is not configured' }, 503);

  const url = new URL(request.url);
  const days = Math.min(180, Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '30', 10) || 30));
  const cutoff = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const statements = [
    env.DB.prepare(`SELECT event_type, SUM(event_count) AS total FROM usage_totals WHERE day >= ? GROUP BY event_type`).bind(cutoff),
    env.DB.prepare(`
      SELECT step_schema,
        SUM(CASE WHEN event_type = 'model_opened' THEN event_count ELSE 0 END) AS opened,
        SUM(CASE WHEN event_type = 'model_failed' THEN event_count ELSE 0 END) AS failed
      FROM usage_totals
      WHERE day >= ? AND event_type IN ('model_opened', 'model_failed')
      GROUP BY step_schema ORDER BY opened DESC, failed DESC
    `).bind(cutoff),
    env.DB.prepare(`
      SELECT day,
        SUM(CASE WHEN event_type = 'page_view' THEN event_count ELSE 0 END) AS page_views,
        SUM(CASE WHEN event_type = 'model_opened' THEN event_count ELSE 0 END) AS model_opened,
        SUM(CASE WHEN event_type = 'model_failed' THEN event_count ELSE 0 END) AS model_failed
      FROM usage_totals WHERE day >= ? GROUP BY day ORDER BY day ASC
    `).bind(cutoff),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM daily_visitors WHERE day >= ?`).bind(cutoff)
  ];
  const [totalsResult, schemasResult, dailyResult, visitorsResult] = await env.DB.batch(statements);
  const totals = Object.fromEntries((totalsResult.results ?? []).map((row) => [row.event_type, Number(row.total ?? 0)]));

  return json({
    days,
    cutoff,
    summary: {
      dailyUniqueVisitors: Number(visitorsResult.results?.[0]?.total ?? 0),
      pageViews: totals.page_view ?? 0,
      zipAccepted: totals.zip_accepted ?? 0,
      modelOpened: totals.model_opened ?? 0,
      modelFailed: totals.model_failed ?? 0
    },
    schemas: (schemasResult.results ?? []).map((row) => ({ schema: row.step_schema, opened: Number(row.opened ?? 0), failed: Number(row.failed ?? 0) })),
    daily: (dailyResult.results ?? []).map((row) => ({ day: row.day, pageViews: Number(row.page_views ?? 0), modelOpened: Number(row.model_opened ?? 0), modelFailed: Number(row.model_failed ?? 0) }))
  });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS' && url.pathname === '/v1/event') {
    if (!isAllowedOrigin(request, env)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method === 'POST' && url.pathname === '/v1/event') return recordEvent(request, env);
  if (request.method === 'GET' && url.pathname === '/v1/stats') return readStats(request, env);
  if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'STEP/3D analytics' });
  if (request.method === 'GET' && url.pathname === '/admin') {
    return new Response(DASHBOARD_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    });
  }
  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });
  return json({ error: 'Not found' }, 404);
}

export default {
  fetch: handleRequest,
  async scheduled(_controller, env) {
    if (!env.DB) return;
    const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM daily_visitors WHERE day < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM event_receipts WHERE day < ?').bind(cutoff)
    ]);
  }
};
