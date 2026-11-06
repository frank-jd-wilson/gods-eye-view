import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjection } from './projection.js';
import { createControls } from './controls.js';
import { createPresentation } from './presentation.js';
const noop = () => {};
const services = {
  render: { holdContinuousRender: noop, releaseContinuousRender: noop },
  activation: {},
};
test('100 playback changes remove destroyed runtimes, canvas buffers and Cesium entities', () => {
  const record = { camera: { id: 'one', sourceKind: 'tw-freeway-motc' } };
  let removed = 0,
    disposed = 0;
  const state = {
    _enabled: true,
    _records: [record],
    _projectionEntities: [],
    _taiwanFilter: {},
    _viewer: {
      entities: { remove: () => removed++ },
      scene: { requestRender: noop },
    },
  };
  const parts = {
    selection: { getActiveRecord: () => record },
    rendering: { refreshCoverageStyles: noop, refreshHorizonCulling: noop },
    cards: { refreshAmbientCards: noop },
    presentation: { notifyListeners: noop },
  };
  const projection = createProjection({ state, services, parts });
  const old = [];
  parts.projection = {
    ...projection,
    ensureProjectionRuntime: () => {
      const canvas = { width: 640, height: 360 };
      record.projection = {
        cameraId: 'one',
        mode: 'mjpeg',
        canvas,
        ctx: {},
        buffers: [{ width: 640, height: 360 }],
        signatureCanvas: { width: 64, height: 36 },
        signatureCtx: {},
        planeEntity: {},
        playback: { dispose: () => disposed++ },
      };
      state._projectionEntities.push(record.projection);
    },
  };
  parts.projection.ensureProjectionRuntime();
  const controls = createControls({ state, services, parts }).methods;
  for (let i = 0; i < 100; i++) {
    old.push(record.projection);
    assert.equal(
      controls.setTaiwanFilter({ playback: i % 2 ? 'mjpeg' : 'image' }),
      true,
    );
    assert.equal(state._projectionEntities.length, 1);
    for (const dead of old) {
      assert.equal(dead.disposed, true);
      assert.equal(dead.canvas, null);
      assert.equal(dead.buffers, null);
      assert.equal(dead.signatureCanvas, null);
      assert.ok(!state._projectionEntities.includes(dead));
    }
  }
  assert.equal(removed, 100);
  assert.equal(disposed, 100);
  projection.destroyProjectionRuntime(record.projection);
  assert.equal(state._projectionEntities.length, 0);
  assert.equal(record.projection, null);
});
test('HUD samples only the same Taiwan road/direction/mileage candidates as map', () => {
  const state = {
    _enabled: true,
    _taiwanFilter: {
      region: 'taiwan',
      road: '1',
      direction: 'S',
      minKm: 5,
      maxKm: 15,
    },
    _records: [
      { camera: { id: 'foreign' } },
      ...[10, 20].map((km) => ({
        camera: { id: String(km), taiwan: { road: '1', direction: 'S', km } },
      })),
      {
        camera: { id: 'north', taiwan: { road: '1', direction: 'N', km: 10 } },
      },
    ],
  };
  const controls = createControls({ state, services, parts: {} }).methods;
  assert.deepEqual(
    controls.getDetectableObjects({ maxCount: 1 }).map((x) => x.sourceId),
    ['10'],
  );
  state._taiwanFilter = {};
  assert.equal(controls.getDetectableObjects().length, 4);
});
for (const kind of ['streetview', 'synthetic', 'snapshot'])
  test(`JPEG fallback preserves actual ${kind} provenance and message`, () => {
    const camera = {
      id: 'one',
      sourceKind: 'tw-freeway-motc',
      feedType: 'mjpeg',
    };
    const state = {
      _healthById: new Map([
        ['one', { sourceKind: kind, message: 'actual backend message' }],
      ]),
    };
    const parts = {
      selection: { getActiveRecord: () => null },
      model: { isVideoFeedType: () => false },
      calibration: {
        normalizeCalibration: () => ({}),
        deriveCalBadge: () => '',
      },
      frames: { frameUrlFor: noop, mediaUrlFor: noop },
    };
    const p = createPresentation({ state, services, parts });
    const actual = p.getPublicCameraState({
      camera,
      projection: { mode: 'image' },
      mediaError: 'taiwan-mjpeg',
    });
    assert.equal(actual.sourceKind, kind);
    assert.equal(actual.sourceMessage, 'actual backend message');
    assert.equal(actual.isVideo, false);
  });
