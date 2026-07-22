import { ANALYTICS_ENDPOINT, ANALYTICS_HOSTS } from './analytics-config.js';

const ALLOWED_EVENTS = new Set([
  'page_view',
  'heartbeat',
  'zip_accepted',
  'archive_rejected',
  'model_opened',
  'model_failed'
]);
const ALLOWED_SCHEMAS = new Set(['AP203', 'AP214', 'AP242', 'Other', 'Unknown', 'None']);
const ALLOWED_FAILURES = new Set([
  'none',
  'encrypted',
  'compression',
  'zip64',
  'no_step',
  'no_geometry',
  'parse_failed',
  'size_limit',
  'archive_invalid',
  'unknown'
]);

const endpoint = String(ANALYTICS_ENDPOINT ?? '').replace(/\/$/, '');
const session = globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function analyticsEnabled() {
  return Boolean(
    endpoint
    && typeof window !== 'undefined'
    && ANALYTICS_HOSTS.includes(window.location.hostname)
    && window.location.protocol !== 'file:'
  );
}

function sendEvent(event, details = {}) {
  if (!analyticsEnabled() || !ALLOWED_EVENTS.has(event)) return null;
  const schema = ALLOWED_SCHEMAS.has(details.schema) ? details.schema : 'None';
  const failure = ALLOWED_FAILURES.has(details.failure) ? details.failure : 'none';
  const payload = JSON.stringify({ event, schema, failure, session });

  return fetch(`${endpoint}/v1/event`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: payload
  }).catch(() => {
    // Analytics is intentionally fail-open and never interrupts CAD work.
  });
}

export function trackUsage(event, details = {}) {
  sendEvent(event, details);
}

export async function readPublicUsage() {
  if (!analyticsEnabled()) return null;
  try {
    const response = await fetch(`${endpoint}/v1/public-stats`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
    if (!response.ok) return null;
    const data = await response.json();
    const totalViews = Number(data.totalViews);
    const onlineNow = Number(data.onlineNow);
    if (!Number.isFinite(totalViews) || totalViews < 0 || !Number.isFinite(onlineNow) || onlineNow < 0) return null;
    return { totalViews, onlineNow };
  } catch {
    return null;
  }
}

export function startUsageMetrics(onUpdate) {
  if (!analyticsEnabled()) return () => {};
  let active = true;
  const refresh = async () => {
    const metrics = await readPublicUsage();
    if (active && metrics) onUpdate?.(metrics);
  };
  const heartbeat = () => {
    if (document.visibilityState === 'visible') return sendEvent('heartbeat');
    return null;
  };
  const handleVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    void Promise.resolve(heartbeat()).then(refresh);
  };

  void Promise.resolve(heartbeat()).then(refresh);
  const refreshTimer = window.setInterval(refresh, 30_000);
  const heartbeatTimer = window.setInterval(heartbeat, 90_000);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    active = false;
    window.clearInterval(refreshTimer);
    window.clearInterval(heartbeatTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
