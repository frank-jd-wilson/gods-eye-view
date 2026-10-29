import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainSelection, TERRAIN_STORAGE_KEY } from './terrainSelection.js';
import { ionFailure, verifyIonTerrain } from './ionStatus.js';
function provider() {
  const callbacks = new Set();
  return {
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
    errorEvent: {
      addEventListener(f) {
        callbacks.add(f);
        return () => callbacks.delete(f);
      },
    },
    fail(error) {
      for (const f of callbacks) f(error);
    },
    callbacks,
  };
}
function fixture(options = {}) {
  const previous = provider(),
    imagery = { unchanged: true },
    camera = { unchanged: true },
    values = new Map();
  const viewer = {
    terrainProvider: previous,
    imageryLayers: imagery,
    camera,
    scene: { globe: { show: true }, requestRender() {} },
  };
  const source = {
    world: async () => ({ provider: provider() }),
    keyless: async () => ({ provider: provider() }),
    flat: async () => ({ provider: provider() }),
  };
  const owner = new TerrainSelection(viewer, {
    factories: source,
    hasToken: true,
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    ...options,
  });
  return { owner, viewer, source, previous, imagery, camera, values };
}
test('terrain choices preserve imagery/camera and persist only successful choices', async () => {
  const f = fixture();
  const before = f.viewer.terrainProvider;
  try {
    for (const id of ['world', 'flat', 'keyless']) {
      await f.owner.select(id);
      assert.equal(f.owner.getState().active, id);
      assert.equal(f.viewer.imageryLayers, f.imagery);
      assert.equal(f.viewer.camera, f.camera);
      assert.equal(f.values.get(TERRAIN_STORAGE_KEY), id);
    }
    assert.equal(before.destroyed, false);
  } finally {
    f.owner.destroy();
  }
});
for (const status of [401, 403, 500])
  test(`terrain HTTP ${status} keeps working Esri and terrain, with safe errors`, async () => {
    const f = fixture();
    f.source.world = async () => {
      throw {
        statusCode: status,
        message: 'https://example.invalid/?access_token=private-fixture',
      };
    };
    try {
      await f.owner.select('world');
      assert.equal(f.viewer.terrainProvider, f.previous);
      assert.equal(f.viewer.imageryLayers, f.imagery);
      assert.equal(f.owner.state.status, 'error');
      assert.ok(!f.owner.state.message.includes('private-fixture'));
      assert.equal(f.values.size, 0);
      await f.owner.select('keyless');
      assert.equal(f.owner.state.status, 'ready');
    } finally {
      f.owner.destroy();
    }
  });
test('timeout and a late provider cannot overwrite a newer selection', async () => {
  const f = fixture({ timeoutMs: 5 });
  let finish;
  f.source.world = () => new Promise((r) => (finish = r));
  try {
    await f.owner.select('world');
    assert.match(f.owner.state.message, /timed out/);
    assert.equal(f.viewer.terrainProvider, f.previous);
    await f.owner.select('flat');
    const active = f.viewer.terrainProvider;
    const late = provider();
    finish({ provider: late });
    await new Promise((r) => setImmediate(r));
    assert.equal(f.viewer.terrainProvider, active);
    assert.equal(late.destroyed, true);
  } finally {
    f.owner.destroy();
  }
});
test('rapid selections cancel pending work and stale errors; tile notices have one owner', async () => {
  const f = fixture();
  let reject;
  f.source.world = () => new Promise((_, r) => (reject = r));
  let notifications = 0;
  const stop = f.owner.subscribe(() => notifications++);
  const pending = f.owner.select('world');
  await Promise.resolve();
  await f.owner.select('flat');
  reject({ statusCode: 403 });
  await pending;
  assert.equal(f.owner.state.active, 'flat');
  assert.equal(f.owner.state.status, 'ready');
  const p = f.viewer.terrainProvider;
  p.fail({ retry: true });
  assert.equal(f.owner.state.status, 'error');
  assert.equal(p.callbacks.size, 1);
  await f.owner.select('keyless');
  assert.equal(p.callbacks.size, 0);
  const n = notifications;
  stop();
  f.owner.destroy();
  assert.equal(notifications, n);
  assert.equal(f.owner.listeners.size, 0);
});
test('Google 3D and missing token never mutate provider or persist unavailable choice', async () => {
  const f = fixture({ hasToken: false });
  try {
    await f.owner.select('world');
    assert.match(f.owner.state.message, /No applied/);
    f.viewer.scene.globe.show = false;
    await f.owner.select('keyless');
    assert.match(f.owner.state.message, /Google 3D/);
    assert.equal(f.viewer.terrainProvider, f.previous);
    assert.equal(f.values.size, 0);
  } finally {
    f.owner.destroy();
  }
});
test('initial selection reads saved preference, default is keyless even with token', async () => {
  const f = fixture();
  assert.equal(f.owner.state.selected, 'keyless');
  f.owner.destroy();
  const next = fixture({ storage: { getItem: () => 'flat' } });
  try {
    await next.owner.ensure();
    assert.equal(next.owner.state.active, 'flat');
  } finally {
    next.owner.destroy();
  }
});
test('verification checks one asset, never returns token or provider body, handles HTTP/network/timeout', async () => {
  const fake = 'mock-ion-token';
  for (const status of [200, 401, 403, 500]) {
    const r = await verifyIonTerrain(fake, {
      fetchImpl: async (url, opts) => {
        assert.equal(url, 'https://api.cesium.com/v1/assets/1/endpoint');
        assert.equal(opts.headers.Authorization, `Bearer ${fake}`);
        return {
          ok: status === 200,
          status,
          async json() {
            return {
              type: 'TERRAIN',
              url: 'https://fixture.invalid/terrain',
              accessToken: 'mock-downstream-secret',
            };
          },
        };
      },
    });
    assert.equal(r.ok, status === 200);
    assert.ok(!JSON.stringify(r).includes(fake));
    assert.ok(!JSON.stringify(r).includes('mock-downstream-secret'));
  }
  const timeout = await verifyIonTerrain(fake, {
    timeoutMs: 5,
    fetchImpl: (_, opts) =>
      new Promise((_, reject) =>
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason)),
      ),
  });
  assert.match(timeout.message, /timed out/);
  const missing = await verifyIonTerrain('');
  assert.equal(missing.ok, false);
  assert.ok(
    !ionFailure(new Error('url-with-token')).includes('url-with-token'),
  );
});

test('HTTP 200 with an invalid terrain endpoint is not verification success', async () => {
  for (const body of [
    {},
    { type: 'IMAGERY', url: 'https://fixture.invalid/' },
    { type: 'TERRAIN', url: 'http://fixture.invalid/' },
  ]) {
    const result = await verifyIonTerrain('mock-only', {
      fetchImpl: async () => ({ ok: true, json: async () => body }),
    });
    assert.equal(result.ok, false);
  }
});
