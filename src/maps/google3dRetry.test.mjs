import test from 'node:test';
import assert from 'node:assert/strict';
import { google3DFactory, google3DFailure } from './google3d.js';
import { createDefaultMapSources } from './defaultSources.js';
import { MapSourceController } from './controller.js';
function event() {
  const listeners = new Set();
  return {
    listeners,
    addEventListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    raise(error) {
      for (const f of [...listeners]) f(error);
    },
  };
}
function model() {
  return {
    show: false,
    tileFailed: event(),
    dead: false,
    destroy() {
      this.dead = true;
    },
    isDestroyed() {
      return this.dead;
    },
  };
}
function fixture(create) {
  const terrain = { original: true },
    camera = { original: true },
    provider = {},
    primitives = new Set(),
    images = new Set(),
    errors = [];
  const viewer = {
    terrainProvider: terrain,
    camera,
    imageryLayers: {
      add: (p) => images.add(p),
      remove: (p) => images.delete(p),
    },
    scene: {
      globe: { show: true },
      requestRender() {},
      primitives: {
        add: (p) => primitives.add(p),
        remove(p) {
          primitives.delete(p);
          p.destroy();
        },
      },
      frameState: {
        creditDisplay: { addStaticCredit() {}, removeStaticCredit() {} },
      },
    },
  };
  const registry = {
    defaultId: 'esri',
    unknownId: 'esri',
    recoveryId: null,
    sources: [
      {
        descriptor: { id: 'esri', kind: 'esri-imagery' },
        imagery: async () => provider,
      },
      {
        descriptor: { id: 'photoreal', kind: 'photoreal' },
        available: true,
        createTileset: create,
      },
    ],
  };
  const controller = new MapSourceController(viewer, {
    registry,
    initialStack: 'esri',
    createImageryLayer: (p) => ({ provider: p }),
    onError: (e) => errors.push(e),
  });
  return {
    controller,
    viewer,
    terrain,
    camera,
    provider,
    primitives,
    images,
    errors,
  };
}
test('ion presence makes a lazy Google chip eligible without a preloaded tileset', () => {
  const registry = createDefaultMapSources({ cesiumToken: 'mock-ion' }),
    source = registry.sources.find((s) => s.descriptor.id === 'photoreal');
  assert.equal(source.available, true);
  assert.equal(typeof source.createTileset, 'function');
  assert.equal(source.tileset, null);
  assert.equal(registry.defaultId, 'esri-imagery');
});
test('factory makes no eager requests, prefers explicit ion token and keeps resource credits', async () => {
  let requests = 0;
  const tileset = model(),
    resource = { credits: ['Google fixture credit'] };
  const sdk = {
    IonResource: {
      async fromAssetId(id, options) {
        requests++;
        assert.equal(id, 2275207);
        assert.equal(options.accessToken, 'mock-ion');
        return resource;
      },
    },
    Cesium3DTileset: {
      async fromUrl(value) {
        assert.equal(value, resource);
        return tileset;
      },
    },
    createGooglePhotorealistic3DTileset() {
      assert.fail('must not require direct Google key');
    },
  };
  const create = google3DFactory(sdk, {
    cesiumToken: 'mock-ion',
    googleApiKey: 'mock-google',
  });
  assert.equal(requests, 0);
  assert.equal(await create(), tileset);
  assert.equal(requests, 1);
  assert.equal(google3DFactory(sdk), null);
});
for (const status of [401, 403, 429, 500])
  test(`Google ${status} preserves standard mode and remains retryable`, async () => {
    let attempts = 0;
    const good = model(),
      f = fixture(async () => {
        attempts++;
        if (attempts === 1)
          throw {
            statusCode: status,
            message: 'https://fixture.invalid/?access_token=mock-secret',
          };
        return good;
      });
    try {
      await f.controller.setStack('esri');
      const before = [...f.images][0];
      await f.controller.setStack('photoreal', { retry: true });
      assert.equal(f.controller.isStackAvailable('photoreal'), true);
      assert.equal(f.controller.getActiveId(), 'esri');
      assert.equal([...f.images][0], before);
      assert.equal(f.viewer.terrainProvider, f.terrain);
      assert.equal(f.viewer.camera, f.camera);
      assert.ok(!f.errors[0].includes('mock-secret'));
      if (status !== 500) assert.ok(f.errors[0].includes(String(status)));
      await f.controller.setStack('photoreal', { retry: true });
      assert.equal(f.controller.getActiveId(), 'photoreal');
      assert.equal(f.viewer.scene.globe.show, false);
      assert.equal(good.show, true);
      assert.equal(f.images.size, 0);
      await f.controller.setStack('esri');
      assert.equal(good.show, false);
      assert.equal(f.viewer.scene.globe.show, true);
      assert.equal(f.viewer.terrainProvider, f.terrain);
      assert.equal(attempts, 2);
    } finally {
      f.controller.destroy();
    }
  });
test('late selection is cached but never displayed over a newer standard choice', async () => {
  let finish;
  const f = fixture(() => new Promise((r) => (finish = r))),
    tileset = model();
  try {
    await f.controller.setStack('esri');
    const old = f.controller.setStack('photoreal');
    await new Promise((r) => setImmediate(r));
    await f.controller.setStack('esri');
    finish(tileset);
    await old;
    assert.equal(f.controller.getActiveId(), 'esri');
    assert.equal(tileset.show, false);
    assert.equal(f.primitives.size, 0);
    await f.controller.setStack('photoreal');
    assert.equal(tileset.show, true);
    assert.equal(f.primitives.size, 1);
  } finally {
    f.controller.destroy();
  }
  assert.equal(tileset.dead, true);
});
test('runtime tile errors announce once, return to standard and fresh retry replaces bad tileset', async () => {
  const first = model(),
    second = model();
  let loads = 0;
  const f = fixture(async () => (++loads === 1 ? first : second));
  try {
    await f.controller.setStack('esri');
    await f.controller.setStack('photoreal');
    first.tileFailed.raise({
      message: 'Request has failed. Status Code: 403',
      url: 'https://fixture.invalid/?token=mock-secret',
    });
    first.tileFailed.raise({ message: 'again' });
    await new Promise((r) => setImmediate(r));
    assert.equal(f.controller.getActiveId(), 'esri');
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0], /403/);
    await f.controller.setStack('photoreal', { retry: true });
    assert.equal(first.dead, true);
    assert.equal(first.tileFailed.listeners.size, 0);
    assert.equal(second.show, true);
    assert.equal(f.primitives.size, 1);
    assert.equal(loads, 2);
  } finally {
    f.controller.destroy();
  }
  assert.equal(second.tileFailed.listeners.size, 0);
});
test('factory timeout/abort releases late models and never returns raw provider diagnostics', async () => {
  let finish;
  const sdk = {
    IonResource: { fromAssetId: async () => ({}) },
    Cesium3DTileset: { fromUrl: () => new Promise((r) => (finish = r)) },
  };
  const create = google3DFactory(
    sdk,
    { cesiumToken: 'mock-ion' },
    { timeoutMs: 5 },
  );
  await assert.rejects(create(), (e) => e.name === 'TimeoutError');
  const late = model();
  finish(late);
  await new Promise((r) => setImmediate(r));
  assert.equal(late.dead, true);
  assert.match(
    google3DFailure({ name: 'MissingGoogle3DCredentials' }),
    /Cesium ion token/,
  );
  assert.ok(!google3DFailure(new Error('token-url')).includes('token-url'));
});
