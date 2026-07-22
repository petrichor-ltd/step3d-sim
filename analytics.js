import { ANALYTICS_ENDPOINT, ANALYTICS_HOSTS } from './analytics-config.js';

const ALLOWED_EVENTS = new Set([
  'page_view',
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

export function trackUsage(event, details = {}) {
  if (!endpoint || !ANALYTICS_HOSTS.includes(window.location.hostname) || !ALLOWED_EVENTS.has(event) || window.location.protocol === 'file:') return;
  const schema = ALLOWED_SCHEMAS.has(details.schema) ? details.schema : 'None';
  const failure = ALLOWED_FAILURES.has(details.failure) ? details.failure : 'none';
  const payload = JSON.stringify({ event, schema, failure, session });

  void fetch(`${endpoint}/v1/event`, {
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
