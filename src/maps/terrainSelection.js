import { msg } from '../i18n/index.js';
import { ionFailure } from './ionStatus.js';

export const TERRAIN_STORAGE_KEY = 'gev:terrain:v1';
const ids = ['world', 'keyless', 'flat'];
/** Own terrain only; never remove imagery, fly the camera or recreate the Viewer. */
export class TerrainSelection {
  constructor(
    viewer,
    { factories, hasToken, storage, timeoutMs = 15000 } = {},
  ) {
    this.viewer = viewer;
    this.factories = factories;
    this.hasToken = hasToken;
    try {
      storage ??= globalThis.localStorage;
    } catch {}
    this.storage = storage;
    this.timeoutMs = timeoutMs;
    this.listeners = new Set();
    this.providers = new Set();
    this.generation = 0;
    this.destroyed = false;
    this.started = false;
    this.state = {
      selected: 'keyless',
      active: 'flat',
      status: 'idle',
      message: null,
    };
    try {
      const saved = storage?.getItem(TERRAIN_STORAGE_KEY);
      if (ids.includes(saved)) this.state.selected = saved;
    } catch {}
  }
  getState() {
    return {
      ...this.state,
      hasToken: this.hasToken,
      photoreal: this.viewer.scene.globe.show === false,
    };
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.getState());
      } catch {
        console.warn('[Terrain] UI update failed');
      }
    }
  }
  ensure() {
    if (this.started || this.destroyed || !this.viewer.scene.globe.show) return;
    this.started = true;
    return this.select(this.state.selected, { persist: false });
  }
  async select(id, { persist = true } = {}) {
    if (this.destroyed || !ids.includes(id)) return;
    const gen = ++this.generation;
    this.pendingAbort?.abort();
    const abort = new AbortController();
    this.pendingAbort = abort;
    this.state.selected = id;
    if (this.viewer.scene.globe.show === false) {
      this.state.status = 'error';
      this.state.message = msg(
        'Terrain is not applied in Google 3D. Select Esri or OSM first.',
      );
      this.emit();
      return;
    }
    if (id === 'world' && !this.hasToken) {
      this.state.status = 'error';
      this.state.message = msg(
        'No applied Cesium token. Save a token and reload the App first.',
      );
      this.emit();
      return;
    }
    this.state.status = 'loading';
    this.state.message = msg('Loading terrain…');
    this.emit();
    let timer,
      result,
      expired = false;
    const pending = Promise.resolve().then(() =>
      this.factories[id]({ signal: abort.signal }),
    );
    // A factory can ignore cancellation. Dispose late owned results instead of applying them.
    pending.then(
      (value) => {
        if (expired || this.destroyed || gen !== this.generation)
          this.dispose(value?.provider);
      },
      () => {},
    );
    try {
      result = await Promise.race([
        pending,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
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
      ]);
      if (this.destroyed || gen !== this.generation) return;
      if (this.viewer.scene.globe.show === false) {
        this.dispose(result.provider);
        this.state.status = 'error';
        this.state.message = msg(
          'Terrain is not applied in Google 3D. Select Esri or OSM first.',
        );
        this.emit();
        return;
      }
      if (result.fallback) {
        this.dispose(result.provider);
        throw {};
      }
      const previous = this.viewer.terrainProvider;
      this.removeError?.();
      this.viewer.terrainProvider = result.provider;
      this.providers.add(result.provider);
      if (this.providers.has(previous) && previous !== result.provider) {
        this.dispose(previous);
        this.providers.delete(previous);
      }
      this.state.active = id;
      this.state.status = 'ready';
      this.state.message = msg('Terrain applied.');
      const event = result.provider.errorEvent;
      this.removeError = event?.addEventListener?.((error) => {
        if (
          this.viewer.terrainProvider !== result.provider ||
          this.destroyed ||
          !this.viewer.scene.globe.show
        )
          return;
        error.retry = false;
        this.state.status = 'error';
        this.state.message = msg(
          'Terrain tile loading failed. Select free terrain or flat Earth to recover.',
        );
        this.emit();
      });
      if (persist) {
        try {
          this.storage?.setItem(TERRAIN_STORAGE_KEY, id);
        } catch {
          this.state.message = msg(
            'Terrain applied, but this browser could not save the preference.',
          );
        }
      }
      this.viewer.scene.requestRender?.();
      this.emit();
    } catch (error) {
      if (result?.provider && this.viewer.terrainProvider !== result.provider)
        this.dispose(result.provider);
      if (!this.destroyed && gen === this.generation) {
        this.state.status = 'error';
        this.state.message = ionFailure(error);
        this.emit();
      }
    } finally {
      clearTimeout(timer);
    }
  }
  dispose(provider) {
    if (provider?.destroy && !provider.isDestroyed?.()) provider.destroy();
  }
  destroy() {
    this.destroyed = true;
    this.generation++;
    this.pendingAbort?.abort();
    this.removeError?.();
    this.listeners.clear();
    for (const p of this.providers) this.dispose(p);
    this.providers.clear();
  }
}
