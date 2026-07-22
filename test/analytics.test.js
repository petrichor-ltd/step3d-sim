import test from 'node:test';
import assert from 'node:assert/strict';

test('reports presence and reads public usage without credentials', async () => {
  const calls = [];
  const listeners = new Map();
  globalThis.window = {
    location: { hostname: 'step3d-sim.petrichor.tw', protocol: 'https:' },
    setInterval: (callback, delay) => ({ callback, delay }),
    clearInterval: () => {}
  };
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name)
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith('/v1/public-stats')) {
      return { ok: true, json: async () => ({ totalViews: 42, onlineNow: 3 }) };
    }
    return { ok: true };
  };

  const analytics = await import(`../analytics.js?test=${Date.now()}`);
  analytics.trackUsage('page_view');
  let metrics;
  const stop = analytics.startUsageMetrics((value) => { metrics = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(metrics, { totalViews: 42, onlineNow: 3 });
  assert.equal(calls.some(({ url, options }) => url === '/api/analytics/v1/event' && options.body.includes('"event":"page_view"')), true);
  assert.equal(calls.some(({ url, options }) => url === '/api/analytics/v1/event' && options.body.includes('"event":"heartbeat"')), true);
  assert.equal(calls.some(({ url }) => url === '/api/analytics/v1/public-stats'), true);
  assert.equal(calls.every(({ options }) => options.credentials === 'omit'), true);

  stop();
  assert.equal(listeners.has('visibilitychange'), false);
});
