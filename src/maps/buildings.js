import * as Cesium from 'cesium';
import { msg } from '../i18n/index.js';

export const OSM_BUILDINGS_ASSET = 96188;

/** Explicit per-resource credentials: never mutate Ion.defaultAccessToken. */
export async function createOsmBuildings(
  accessToken,
  { signal, sdk = Cesium } = {},
) {
  signal?.throwIfAborted();
  const resource = await sdk.IonResource.fromAssetId(OSM_BUILDINGS_ASSET, {
    accessToken,
  });
  signal?.throwIfAborted();
  const tileset = await sdk.Cesium3DTileset.fromUrl(resource, {
    maximumScreenSpaceError: 16,
    cacheBytes: 64 * 1024 * 1024,
    maximumCacheOverflowBytes: 32 * 1024 * 1024,
  });
  if (signal?.aborted) {
    if (!tileset.isDestroyed()) tileset.destroy();
    signal.throwIfAborted();
  }
  return tileset;
}

/** Error objects/URLs can carry ion credentials. Return fixed text only. */
export function buildingsFailure(error, stage = 'load') {
  const direct = Number(error?.statusCode || error?.status);
  // tileFailed exposes only {url,message}, not the original HTTP status.
  const match = /(?:status(?:\s+code)?|http)\s*[:=]?\s*(401|403)\b/i.exec(
    String(error?.message || ''),
  );
  const status = direct || Number(match?.[1]);
  if (status === 401)
    return msg('Buildings: Cesium ion rejected the token (401).');
  if (status === 403)
    return msg(
      'Buildings: asset 96188 is not authorized or the allowed URL is restricted (403).',
    );
  if (error?.name === 'TimeoutError')
    return msg(
      'Buildings request timed out. Imagery and terrain are unchanged.',
    );
  if (
    stage !== 'render' &&
    stage !== 'attach' &&
    (Object.hasOwn(error || {}, 'statusCode') ||
      /request has failed|failed to fetch|network error/i.test(
        String(error?.message || ''),
      ))
  )
    return msg(
      'Buildings network request failed. Imagery and terrain are unchanged.',
    );
  if (stage === 'tile')
    return msg(
      'Buildings 3D tile request or processing failed. Switch Off and On to retry.',
    );
  if (stage === 'render')
    return msg(
      'Rendering failed while buildings were enabled. Buildings were hidden; reload if rendering does not recover.',
    );
  if (stage === 'attach')
    return msg(
      'Buildings tileset could not be added to the scene. Imagery and terrain are unchanged.',
    );
  return msg(
    'Buildings tileset could not be loaded. Check network access and asset permissions.',
  );
}

/** Independent primitive owner; no imagery, terrain, camera or Viewer recreation. */
export class BuildingsController {
  constructor(
    viewer,
    { token = '', create = createOsmBuildings, timeoutMs = 20000 } = {},
  ) {
    this.viewer = viewer;
    this.token = String(token || '').trim();
    this.create = create;
    this.timeoutMs = timeoutMs;
    this.state = {
      enabled: false,
      status: 'off',
      message: null,
      coverage: 'unknown',
    };
    this.listeners = new Set();
    this.removers = [];
    this.destroyed = false;
    this.tileset = null;
    this.pending = null;
    this.timer = null;
    this.attach = false;
    this.visibleFeatures = 0;
    const bind = (event, fn) => {
      const remove = event?.addEventListener?.(fn);
      if (remove) this.removers.push(remove);
    };
    bind(viewer.scene?.preRender, () => {
      this.visibleFeatures = 0;
    });
    bind(viewer.scene?.postRender, () => this.updateCoverage());
    bind(viewer.scene?.renderError, () => {
      if (this.tileset?.show) this.fail({}, 'render');
    });
  }
  getState() {
    return {
      ...this.state,
      hasToken: Boolean(this.token),
      suspended: this.viewer.scene.globe.show === false,
    };
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    if (this.destroyed) return;
    for (const fn of this.listeners) {
      try {
        fn(this.getState());
      } catch {
        console.warn('[Buildings] UI update failed');
      }
    }
  }
  updateCoverage() {
    if (
      !this.tileset?.show ||
      this.state.status === 'error' ||
      !this.tileset.tilesLoaded
    )
      return;
    const coverage = this.visibleFeatures > 0 ? 'visible' : 'empty';
    if (coverage === this.state.coverage) return;
    this.state.coverage = coverage;
    this.emit();
  }
  fail(error, stage) {
    if (this.destroyed || !this.state.enabled) return;
    if (this.tileset) this.tileset.show = false;
    const message = buildingsFailure(error, stage);
    if (this.state.status === 'error' && this.state.message === message) return;
    this.state.status = 'error';
    this.state.message = message;
    this.state.coverage = 'unknown';
    this.emit();
    this.viewer.scene.requestRender?.();
  }
  syncMapVisibility() {
    if (this.destroyed) return;
    if (this.tileset)
      this.tileset.show =
        this.state.enabled &&
        this.state.status !== 'error' &&
        this.viewer.scene.globe.show;
    if (
      this.state.enabled &&
      this.viewer.scene.globe.show &&
      !this.tileset &&
      !this.pending &&
      this.state.status !== 'error'
    ) {
      void this.setEnabled(true);
    }
    this.emit();
    this.viewer.scene.requestRender?.();
  }
  async setEnabled(enabled) {
    if (this.destroyed) return;
    const wasError = this.state.status === 'error';
    this.state.enabled = Boolean(enabled);
    this.state.coverage = 'unknown';
    if (!enabled) {
      if (this.tileset) this.tileset.show = false;
      this.state.status = 'off';
      this.state.message = null;
      if (wasError) this.removeTileset();
      this.emit();
      this.viewer.scene.requestRender?.();
      return;
    }
    if (!this.token) {
      this.state.status = 'error';
      this.state.message = msg(
        'Buildings need an applied Cesium ion token. Save a token and reload the App first.',
      );
      this.emit();
      return;
    }
    if (this.viewer.scene.globe.show === false) {
      this.syncMapVisibility();
      return;
    }
    if (wasError) this.removeTileset();
    if (this.tileset) {
      this.state.status = 'ready';
      this.state.message = null;
      this.syncMapVisibility();
      return;
    }
    if (this.pending) {
      this.state.status = 'loading';
      this.emit();
      return this.pending;
    }
    this.state.status = 'loading';
    this.state.message = null;
    this.emit();
    const abort = new AbortController();
    this.abort = abort;
    let expired = false;
    const source = Promise.resolve().then(() =>
      this.create(this.token, { signal: abort.signal }),
    );
    source.then(
      (value) => {
        if (expired || this.destroyed) this.dispose(value);
      },
      () => {},
    );
    let stage = 'load';
    this.pending = Promise.race([
      source,
      new Promise((_, reject) => {
        this.timer = setTimeout(() => {
          expired = true;
          abort.abort();
          reject({ name: 'TimeoutError' });
        }, this.timeoutMs);
        abort.signal.addEventListener(
          'abort',
          () => {
            if (!expired) reject({ name: 'AbortError' });
          },
          { once: true },
        );
      }),
    ])
      .then((tileset) => {
        if (this.destroyed) return;
        this.tileset = tileset;
        tileset.show = false;
        // Install tileFailed before primitives.add so Cesium never falls back to logging credential URLs.
        const bind = (event, fn) => {
          const remove = event?.addEventListener?.(fn);
          if (remove) this.tileRemovers.push(remove);
        };
        this.tileRemovers = [];
        bind(tileset.tileFailed, (error) => {
          if (this.tileset === tileset && tileset.show)
            this.fail(error, 'tile');
        });
        bind(tileset.tileVisible, (tile) => {
          if (!tileset.show || this.state.status === 'error') return;
          const contents = [tile.content];
          for (let i = 0; i < contents.length && i < 64; i++) {
            const content = contents[i];
            this.visibleFeatures += Number(content?.featuresLength || 0);
            if (Array.isArray(content?.innerContents))
              contents.push(
                ...content.innerContents.slice(0, 64 - contents.length),
              );
          }
        });
        stage = 'attach';
        this.viewer.scene.primitives.add(tileset);
        this.attach = true;
        if (this.state.enabled) {
          this.state.status = 'ready';
          this.state.message = null;
        }
        this.syncMapVisibility();
      })
      .catch((error) => {
        if (!this.destroyed && this.state.enabled) this.fail(error, stage);
        this.removeTileset();
      })
      .finally(() => {
        clearTimeout(this.timer);
        this.timer = null;
        this.pending = null;
      });
    return this.pending;
  }
  dispose(tileset) {
    if (tileset?.destroy && !tileset.isDestroyed?.()) tileset.destroy();
  }
  removeTileset() {
    for (const remove of this.tileRemovers || []) remove();
    this.tileRemovers = [];
    if (this.tileset) {
      if (this.attach || this.viewer.scene.primitives.contains?.(this.tileset))
        this.viewer.scene.primitives.remove(this.tileset);
      this.dispose(this.tileset);
    }
    this.tileset = null;
    this.attach = false;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort?.abort();
    clearTimeout(this.timer);
    this.removeTileset();
    for (const remove of this.removers) remove();
    this.removers = [];
    this.listeners.clear();
  }
}
