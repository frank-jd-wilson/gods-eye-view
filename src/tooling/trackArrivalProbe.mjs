/** Browser-only fixture shared by the original tracking gate and timing diagnosis. */
export async function runArrivalProbe({ captureFrames = false } = {}) {
  const v = window.__godsEyeView.viewer;
  const dm = window.__godsEyeView.dataManager;
  const { screenProjectedRotation } = await import(
    `${window.__gevQaSourceBase || '/src'}/data/iconOrientation.js`
  );
  const { observeArrivalRotation } = await import(
    `${window.__gevQaSourceBase || '/src'}/tooling/trackArrivalObservation.mjs`
  );
  // 3D models OFF for this phase: a model-handed-off billboard is hidden
  // and skips rotation updates entirely — the probes need live billboards
  // (this is also the app's default state the field report came from).
  dm.layers.get('flights').module.setParams({ models3d: false });
  dm.layers.get('military').module.setParams({ models3d: false });
  const findBB = (id) => {
    let found = null;
    const walk = (coll) => {
      const n = coll.length;
      for (let i = 0; i < n; i++) {
        let p;
        try {
          p = coll.get(i);
        } catch {
          continue;
        }
        if (!p) continue;
        if (typeof p.length === 'number' && typeof p.get === 'function') {
          walk(p);
          continue;
        }
        if (p.image !== undefined && p.alignedAxis !== undefined && p.id === id)
          found = p;
      }
    };
    walk(v.scene.primitives);
    return found;
  };
  const nextFrames = (n) =>
    new Promise((res) => {
      let count = 0;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rm();
        res();
      };
      const rm = v.scene.postRender.addEventListener(() => {
        if (++count >= n) {
          finish();
          return;
        }
        v.scene.requestRender();
      });
      const timer = setTimeout(finish, Math.max(10000, n * 1500));
      v.scene.requestRender();
    });
  // Park the camera straight above the flights cluster (lift a live
  // billboard's position radially — no Cesium global needed in-page) so
  // every probe plane projects on-screen, then let rotations settle at
  // the new pose (the setView pose change forces a pass on the next tick).
  // aaa002 — aaa001 was evicted for good by the M3 age-out phase.
  const anchor = findBB('aaa002');
  if (!anchor) return { error: 'anchor aaa002 missing' };
  const p = anchor.position;
  const r = Math.hypot(p.x, p.y, p.z);
  const k = (r + 25000) / r;
  v.camera.cancelFlight();
  v.camera.setView({
    destination: { x: p.x * k, y: p.y * k, z: p.z * k },
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  await nextFrames(3);
  const angDiff = (a, b) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const probe = async (id, course) => {
    const bb = findBB(id);
    if (!bb || !bb.show) return { error: `${id} missing/hidden` };
    const r0 = bb.rotation; // settled tamper origin; correctness uses a fresh projection below
    const frames = [];
    const startedAt = performance.now();
    const capture = (phase) => () =>
      frames.push({
        phase,
        elapsedMs: performance.now() - startedAt,
        shown: bb.show,
        rotationError: angDiff(
          bb.rotation,
          screenProjectedRotation(v.scene, bb.position, course, null),
        ),
      });
    const removePre = captureFrames
      ? v.scene.preRender.addEventListener(capture('preRender'))
      : null;
    const removePost = captureFrames
      ? v.scene.postRender.addEventListener(capture('postRender'))
      : null;
    let observed;
    try {
      observed = await observeArrivalRotation({
        scene: v.scene,
        startMoveEnd() {
          // Only moveEnd can repair the tampered angle at the idle pose.
          bb.rotation = r0 + 1.5;
          v.camera.moveEnd.raiseEvent();
        },
        startReveal() {
          // Hide immediately after the confirmed settle frame. The next
          // eligible fleet tick must reveal AND re-aim in that same tick.
          bb.rotation = r0 + 1.5;
          bb.show = false;
        },
        read() {
          return {
            shown: bb.show,
            rotationError: angDiff(
              bb.rotation,
              screenProjectedRotation(v.scene, bb.position, course, null),
            ),
          };
        },
      });
    } finally {
      removePre?.();
      removePost?.();
    }
    const hasModel = !!(window.__g3dFindModel && window.__g3dFindModel(id));
    return { r0, ...observed, hasModel, ...(captureFrames ? { frames } : {}) };
  };
  const flightCourse =
    window.__SYNTH.flights.find((f) => f.icao === 'aaa002')?.track ?? 0;
  const militaryCourse =
    window.__SYNTH.military.find((m) => m.hex === 'bbb101')?.track ?? 0;
  return {
    flights: await probe('aaa002', flightCourse),
    military: await probe('bbb101', militaryCourse),
  };
}
