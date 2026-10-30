import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BuildingsController,
  createOsmBuildings,
  buildingsFailure,
} from './buildings.js';
function event() {
  const callbacks = new Set();
  return {
    callbacks,
    addEventListener(fn) {
      callbacks.add(fn);
      return () => callbacks.delete(fn);
    },
    raise(...args) {
      for (const f of [...callbacks]) f(...args);
    },
  };
}
function model() {
  return {
    show: false,
    tilesLoaded: true,
    tileFailed: event(),
    tileVisible: event(),
    dead: false,
    isDestroyed() {
      return this.dead;
    },
    destroy() {
      this.dead = true;
    },
  };
}
function fixture(options = {}) {
  const objects = new Set();
  const terrain = { original: true },
    imagery = { original: true },
    camera = { original: true };
  let creates = 0;
  const tileset = model();
  const viewer = {
    terrainProvider: terrain,
    imageryLayers: imagery,
    camera,
    scene: {
      globe: { show: true },
      preRender: event(),
      postRender: event(),
      renderError: event(),
      requestRender() {},
      primitives: {
        add(p) {
          objects.add(p);
          return p;
        },
        remove(p) {
          return objects.delete(p);
        },
        contains(p) {
          return objects.has(p);
        },
      },
    },
  };
  const owner = new BuildingsController(viewer, {
    token: 'mock-ion-only',
    create: async () => {
      creates++;
      return tileset;
    },
    ...options,
  });
  return {
    owner,
    viewer,
    terrain,
    imagery,
    camera,
    objects,
    tileset,
    creates: () => creates,
  };
}
test('default Off makes no requests; ten toggles reuse one primitive and preserve all map state', async () => {
  const f = fixture();
  assert.equal(f.creates(), 0);
  assert.equal(f.owner.getState().enabled, false);
  try {
    for (let i = 0; i < 10; i++) {
      await f.owner.setEnabled(true);
      assert.equal(f.tileset.show, true);
      assert.equal(f.objects.size, 1);
      await f.owner.setEnabled(false);
      assert.equal(f.tileset.show, false);
      assert.equal(f.viewer.terrainProvider, f.terrain);
      assert.equal(f.viewer.imageryLayers, f.imagery);
      assert.equal(f.viewer.camera, f.camera);
    }
    assert.equal(f.creates(), 1);
    assert.equal(f.tileset.tileFailed.callbacks.size, 1);
  } finally {
    f.owner.destroy();
  }
  assert.equal(f.objects.size, 0);
  assert.equal(f.tileset.dead, true);
  assert.equal(f.tileset.tileFailed.callbacks.size, 0);
  assert.equal(f.viewer.scene.postRender.callbacks.size, 0);
});
test('Off while pending never reveals stale load, On shares one in-flight request', async () => {
  let finish,
    count = 0;
  const f = fixture({
    create: () => {
      count++;
      return new Promise((r) => (finish = r));
    },
  });
  const pending = f.owner.setEnabled(true);
  await Promise.resolve();
  await f.owner.setEnabled(false);
  const again = f.owner.setEnabled(true);
  await f.owner.setEnabled(false);
  finish(f.tileset);
  await Promise.all([pending, again]);
  assert.equal(count, 1);
  assert.equal(f.tileset.show, false);
  assert.equal(f.objects.size, 1);
  await f.owner.setEnabled(true);
  assert.equal(f.tileset.show, true);
  f.owner.destroy();
});
test('destroy or timeout disposes late results and never changes imagery/terrain', async () => {
  for (const destroy of [false, true]) {
    let finish;
    const f = fixture({
      timeoutMs: 5,
      create: () => new Promise((r) => (finish = r)),
    });
    const work = f.owner.setEnabled(true);
    await Promise.resolve();
    if (destroy) f.owner.destroy();
    await work;
    const late = model();
    finish(late);
    await new Promise((r) => setImmediate(r));
    assert.equal(late.dead, true);
    assert.equal(f.objects.size, 0);
    assert.equal(f.viewer.terrainProvider, f.terrain);
    if (!destroy) assert.match(f.owner.state.message, /timed out/);
    f.owner.destroy();
  }
});
for (const status of [401, 403, 500])
  test(`HTTP ${status} has safe classification and preserves baseline`, async () => {
    const f = fixture({
      create: async () => {
        throw {
          statusCode: status,
          message: 'https://fixture.invalid/?access_token=mock-private',
        };
      },
    });
    await f.owner.setEnabled(true);
    assert.equal(f.owner.state.status, 'error');
    assert.ok(!f.owner.state.message.includes('mock-private'));
    if (status === 500)
      assert.match(f.owner.state.message, /network request failed/);
    if (status !== 500)
      assert.ok(f.owner.state.message.includes(String(status)));
    assert.equal(f.objects.size, 0);
    assert.equal(f.viewer.terrainProvider, f.terrain);
    assert.equal(f.viewer.imageryLayers, f.imagery);
    f.owner.destroy();
  });
test('missing token and Google 3D do not load; return to globe resumes desired buildings', async () => {
  const f = fixture({ token: '' });
  await f.owner.setEnabled(true);
  assert.match(f.owner.state.message, /token/);
  assert.equal(f.creates(), 0);
  f.owner.destroy();
  const g = fixture();
  g.viewer.scene.globe.show = false;
  await g.owner.setEnabled(true);
  assert.equal(g.creates(), 0);
  assert.equal(g.owner.getState().suspended, true);
  g.viewer.scene.globe.show = true;
  g.owner.syncMapVisibility();
  await g.owner.pending;
  assert.equal(g.tileset.show, true);
  g.viewer.terrainProvider = { another: true };
  g.owner.syncMapVisibility();
  assert.equal(g.tileset.show, true);
  assert.equal(g.creates(), 1);
  g.viewer.scene.globe.show = false;
  g.owner.syncMapVisibility();
  assert.equal(g.tileset.show, false);
  g.viewer.scene.globe.show = true;
  g.owner.syncMapVisibility();
  assert.equal(g.tileset.show, true);
  g.owner.destroy();
});
test('tile network error, no visible coverage and render failure are different states', async () => {
  const f = fixture();
  await f.owner.setEnabled(true);
  f.viewer.scene.preRender.raise();
  f.viewer.scene.postRender.raise();
  assert.equal(f.owner.state.coverage, 'empty');
  assert.equal(f.owner.state.status, 'ready');
  f.viewer.scene.preRender.raise();
  f.tileset.tileVisible.raise({ content: { featuresLength: 4 } });
  f.viewer.scene.postRender.raise();
  assert.equal(f.owner.state.coverage, 'visible');
  let updates = 0;
  const stop = f.owner.subscribe(() => updates++);
  f.tileset.tileFailed.raise({
    message: 'Request has failed. Status Code: 403',
    url: 'https://fixture.invalid/?access_token=secret-fixture',
  });
  assert.match(f.owner.state.message, /403/);
  assert.equal(f.tileset.show, false);
  const n = updates;
  f.tileset.tileFailed.raise({ message: 'same' });
  assert.equal(updates, n);
  stop();
  assert.equal(f.viewer.terrainProvider, f.terrain);
  f.owner.destroy();
  const g = fixture();
  await g.owner.setEnabled(true);
  g.viewer.scene.renderError.raise({}, new Error('credential-url'));
  assert.match(g.owner.state.message, /Rendering failed/);
  assert.equal(g.tileset.show, false);
  assert.equal(g.viewer.imageryLayers, g.imagery);
  g.owner.destroy();
});
test('attach failure disposes model and permits manual retry', async () => {
  const f = fixture();
  f.viewer.scene.primitives.add = () => {
    throw Error('fixture render allocation');
  };
  await f.owner.setEnabled(true);
  assert.match(f.owner.state.message, /added to the scene/);
  assert.equal(f.tileset.dead, true);
  assert.equal(f.objects.size, 0);
  const next = model();
  f.owner.create = async () => next;
  f.viewer.scene.primitives.add = (p) => {
    f.objects.add(p);
    return p;
  };
  await f.owner.setEnabled(true);
  assert.equal(next.show, true);
  assert.equal(f.objects.size, 1);
  f.owner.destroy();
});
test('factory uses asset 96188 and explicit token without SDK-wide credentials', async () => {
  const tileset = model();
  let resourceUsed;
  const sdk = {
    Ion: { defaultAccessToken: 'unchanged-fixture' },
    IonResource: {
      async fromAssetId(id, { accessToken }) {
        assert.equal(id, 96188);
        assert.equal(accessToken, 'mock-explicit');
        return { resource: true };
      },
    },
    Cesium3DTileset: {
      async fromUrl(resource, options) {
        resourceUsed = resource;
        assert.equal(options.cacheBytes, 64 * 1024 * 1024);
        return tileset;
      },
    },
  };
  assert.equal(await createOsmBuildings('mock-explicit', { sdk }), tileset);
  assert.deepEqual(resourceUsed, { resource: true });
  assert.equal(sdk.Ion.defaultAccessToken, 'unchanged-fixture');
  assert.ok(
    !buildingsFailure({ message: 'token-in-error' }).includes('token-in-error'),
  );
});
