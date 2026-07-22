import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, isAllowedOrigin, normalizeEvent } from '../src/index.js';

class MockStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    this.database.runs.push({ sql: this.sql, values: this.values });
    return { meta: { changes: 1 } };
  }
}

class MockDatabase {
  constructor() {
    this.runs = [];
    this.batchResults = [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }

  async batch(statements) {
    this.batchStatements = statements;
    return this.batchResults;
  }
}

const origin = 'https://step3d-sim.petrichor.tw';

test('normalizes only fixed event fields', () => {
  assert.deepEqual(normalizeEvent({ event: 'model_opened', schema: 'AP214', failure: 'none', session: '12345678-abcd' }), {
    event: 'model_opened', schema: 'AP214', failure: 'none', session: '12345678-abcd'
  });
  assert.equal(normalizeEvent({ event: 'heartbeat', session: '12345678-abcd' }).event, 'heartbeat');
  assert.equal(normalizeEvent({ event: 'model_name', session: '12345678' }), null);
  assert.equal(normalizeEvent({ event: 'page_view', session: 'bad' }), null);
});

test('allows only the configured site origin', () => {
  const env = { ALLOWED_ORIGIN: origin };
  assert.equal(isAllowedOrigin(new Request('https://analytics.example/v1/event', { headers: { Origin: origin } }), env), true);
  assert.equal(isAllowedOrigin(new Request('https://analytics.example/v1/event', { headers: { Origin: 'https://evil.example' } }), env), false);
});

test('records aggregate event without model metadata', async () => {
  const database = new MockDatabase();
  const env = { DB: database, ANALYTICS_SALT: 'test-salt', ALLOWED_ORIGIN: origin };
  const request = new Request('https://analytics.example/v1/event', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', 'User-Agent': 'test' },
    body: JSON.stringify({ event: 'model_opened', schema: 'AP242', failure: 'none', session: '12345678-abcd', filename: 'secret.step' })
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 202);
  assert.equal(database.runs.length, 4);
  const serialized = JSON.stringify(database.runs);
  assert.equal(serialized.includes('secret.step'), false);
  assert.equal(serialized.includes('192.0.2.10'), false);
  assert.equal(serialized.includes('model_opened'), true);
  assert.equal(serialized.includes('AP242'), true);
});

test('heartbeat updates only anonymous presence', async () => {
  const database = new MockDatabase();
  const request = new Request('https://step3d-sim.petrichor.tw/api/analytics/v1/event', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.20', 'User-Agent': 'private-agent' },
    body: JSON.stringify({ event: 'heartbeat', session: '12345678-abcd', filename: 'secret.step' })
  });
  const response = await handleRequest(request, { DB: database, ANALYTICS_SALT: 'test-salt', ALLOWED_ORIGIN: origin });
  assert.equal(response.status, 202);
  assert.equal(database.runs.length, 1);
  assert.match(database.runs[0].sql, /active_sessions/);
  const serialized = JSON.stringify(database.runs);
  assert.doesNotMatch(serialized, /secret\.step|192\.0\.2\.20|private-agent/);
  assert.doesNotMatch(serialized, /usage_totals|daily_visitors|event_receipts/);
});

test('rejects oversized payloads even without a Content-Length header', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({
        event: 'page_view',
        session: '12345678-abcd',
        padding: 'x'.repeat(5000)
      })));
      controller.close();
    }
  });
  const request = new Request('https://analytics.example/v1/event', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half'
  });
  const response = await handleRequest(request, {
    DB: new MockDatabase(),
    ANALYTICS_SALT: 'test-salt',
    ALLOWED_ORIGIN: origin
  });
  assert.equal(response.status, 413);
});

test('rejects unauthorized stats and serves dashboard securely', async () => {
  const unauthorized = await handleRequest(new Request('https://analytics.example/v1/stats'), { ADMIN_TOKEN: 'secret', DB: new MockDatabase() });
  assert.equal(unauthorized.status, 401);

  const dashboard = await handleRequest(new Request('https://step3d-sim.petrichor.tw/api/analytics/admin'), {});
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(dashboard.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /匿名使用統計/);
  assert.match(dashboardHtml, /autocomplete="off"/);
  assert.doesNotMatch(dashboardHtml, /autocomplete="current-password"/);

  const root = await handleRequest(new Request('https://step3d-sim.petrichor.tw/api/analytics/'), {});
  assert.deepEqual(await root.json(), { ok: true, service: 'STEP/3D analytics' });
});

test('returns public total views and current online count', async () => {
  const database = new MockDatabase();
  database.batchResults = [
    { results: [{ total: 123 }] },
    { results: [{ total: 4 }] }
  ];
  const response = await handleRequest(
    new Request('https://step3d-sim.petrichor.tw/api/analytics/v1/public-stats'),
    { DB: database }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { totalViews: 123, onlineNow: 4, onlineWindowSeconds: 180 });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(database.batchStatements[1].sql, /active_sessions/);
});

test('returns aggregate stats for an authorized admin', async () => {
  const database = new MockDatabase();
  database.batchResults = [
    { results: [{ event_type: 'page_view', total: 12 }, { event_type: 'model_opened', total: 7 }, { event_type: 'model_failed', total: 2 }] },
    { results: [{ step_schema: 'AP214', opened: 5, failed: 1 }] },
    { results: [{ day: '2026-07-22', page_views: 12, model_opened: 7, model_failed: 2 }] },
    { results: [{ total: 9 }] }
  ];
  const request = new Request('https://analytics.example/v1/stats?days=30', { headers: { Authorization: 'Bearer secret' } });
  const response = await handleRequest(request, { ADMIN_TOKEN: 'secret', DB: database });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.summary.dailyUniqueVisitors, 9);
  assert.equal(data.summary.modelOpened, 7);
  assert.deepEqual(data.schemas[0], { schema: 'AP214', opened: 5, failed: 1 });
});
