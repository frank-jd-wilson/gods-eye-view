import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readTflResponse,
  tflFailure,
  createTflPositionCache,
} from './tflResilience.js';
import { loadTflSourcesFromOpenData } from './sources.js';
import { createCctvCatalog } from './catalog.js';
import { CCTV_SOURCE_CACHE_MS } from './constants.js';
const read = async (r) => r.text();
const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
const row = {
  id: 'JamCams_test',
  lat: 51.5,
  lon: -0.12,
  additionalProperties: [],
};

test('valid JSON and normal empty result are distinct from HTML, invalid JSON and schema errors', async () => {
  assert.deepEqual((await readTflResponse(json([row]), read)).rows, [row]);
  assert.deepEqual((await readTflResponse(json([]), read)).rows, []);
  for (const [response, code] of [
    [
      new Response('<html>Verification required secret</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      'html-response',
    ],
    [
      new Response('<html>Verification required</html>', {
        headers: { 'Content-Type': 'application/json' },
      }),
      'html-response',
    ],
    [
      new Response('{bad', { headers: { 'Content-Type': 'application/json' } }),
      'invalid-json',
    ],
    [json({ places: [] }), 'invalid-schema'],
    [json([{}]), 'invalid-schema'],
    [new Response('[]'), 'content-type'],
  ])
    assert.equal(
      (await readTflResponse(response, read)).error.sourceStatus.code,
      code,
    );
});
for (const status of [401, 403, 429, 500, 503])
  test(`HTTP ${status} has a safe fixed diagnosis`, async () => {
    const result = await readTflResponse(
      new Response('secret-key <html>', { status }),
      read,
    );
    assert.equal(result.error.sourceStatus.httpStatus, status);
    assert.equal(
      result.error.sourceStatus.code,
      status >= 500 ? 'http-5xx' : `http-${status}`,
    );
    assert.ok(!JSON.stringify(result).includes('secret'));
  });
test('loader sanitizes timeout and network exceptions without exposing URL or key', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  for (const name of ['TimeoutError', 'AbortError', 'TypeError']) {
    globalThis.fetch = async () => {
      const e = new Error('https://secret?app_key=DO_NOT_LOG');
      e.name = name;
      throw e;
    };
    const result = await loadTflSourcesFromOpenData();
    assert.equal(
      result.sourceStatus.code,
      name === 'TypeError' ? 'network' : 'timeout',
    );
    assert.ok(!JSON.stringify(result.sourceStatus).includes('DO_NOT_LOG'));
  }
});
const station = {
  id: 'tfl-test',
  name: 'Test',
  lat: 51.5,
  lon: -0.12,
  url: 'https://official/clip.mp4',
  snapshotUrl: 'https://official/still.jpg',
  feedType: 'mp4',
};
test('retention requires explicit policy, strips media and expires without refreshing old timestamp', () => {
  let now = 1000;
  const deny = createTflPositionCache({ now: () => now });
  deny([station]);
  assert.equal(deny(tflFailure('network')).rows.length, 0);
  const cache = createTflPositionCache({ now: () => now, retentionMs: 100 });
  cache([station]);
  now += 50;
  const stale = cache(tflFailure('http-403', 403));
  assert.equal(stale.status.state, 'stale');
  assert.equal(stale.rows[0].url, '');
  assert.equal(stale.rows[0].snapshotUrl, '');
  assert.equal(stale.rows[0].stalePositionOnly, true);
  now += 51;
  assert.equal(cache(tflFailure('timeout')).rows.length, 0);
  assert.equal(cache([{ ...station, name: 'New' }]).status.state, 'ok');
  assert.equal(cache(tflFailure('network')).rows[0].name, 'New');
  cache([]);
  assert.equal(cache(tflFailure('network')).rows.length, 0);
});

test('catalog keeps other cities during TfL failure, exposes status and recovers without stale overwrite', async (t) => {
  const previous = {};
  for (const key of ['CCTV_FORCE_AUSTIN', 'CCTV_TFL_POSITION_RETENTION_MS']) {
    previous[key] = process.env[key];
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.CCTV_FORCE_AUSTIN = '1';
  process.env.CCTV_TFL_POSITION_RETENTION_MS = String(CCTV_SOURCE_CACHE_MS * 2);
  let now = Date.now(),
    fail = true,
    version = 1;
  const catalog = createCctvCatalog({
    sourceRoot: '/tmp/nonexistent-tfl-fixture',
    clock: () => now,
    livePacks: [
      {
        name: 'tfl',
        enabled: () => true,
        load: async () =>
          fail
            ? tflFailure('html-response', 200)
            : [{ ...station, name: `Version ${version}` }],
      },
      {
        name: 'other',
        enabled: () => true,
        load: async () => [{ ...station, id: 'other-city', city: 'Other' }],
      },
    ],
  });
  let rows = await catalog();
  assert.ok(rows.some((r) => r.id === 'other-city'));
  assert.ok(!rows.some((r) => r.id === 'tfl-test'));
  assert.equal(catalog.sourceStatuses(rows)[0].state, 'unavailable');
  async function refresh() {
    now += CCTV_SOURCE_CACHE_MS + 1;
    await catalog();
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    return catalog();
  }
  fail = false;
  rows = await refresh();
  assert.ok(rows.some((r) => r.id === 'tfl-test'));
  assert.equal(catalog.sourceStatuses(rows)[0].state, 'ok');
  fail = true;
  rows = await refresh();
  assert.ok(rows.some((r) => r.id === 'other-city'));
  assert.equal(catalog.sourceStatuses(rows)[0].state, 'stale');
  assert.equal(rows.find((r) => r.id === 'tfl-test').url, '');
  assert.equal(rows.find((r) => r.id === 'tfl-test').stalePositionOnly, true);
  rows = await refresh();
  assert.equal(catalog.sourceStatuses(rows)[0].state, 'unavailable');
  assert.ok(!rows.some((r) => r.id === 'tfl-test'));
  fail = false;
  version = 2;
  rows = await refresh();
  assert.equal(rows.find((r) => r.id === 'tfl-test').name, 'Version 2');
});
