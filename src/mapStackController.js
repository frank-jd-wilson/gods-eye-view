import { BuildingsController } from './maps/buildings.js';
import * as Cesium from 'cesium';
import { TerrainSelection } from './maps/terrainSelection.js';
import { createWorldTerrain, createKeylessTerrain } from './maps/terrain.js';
import { MapSourceController } from './maps/controller.js';
import { createDefaultMapSources } from './maps/defaultSources.js';
import { governorRequestRender } from './renderGovernor.js';
export { MAP_STACKS } from './maps/catalog.js';
export { photorealUnavailableReason } from './maps/availability.js';

/** Preserve the standalone entry point; applications can compose the source controller directly. */
export class MapStackController extends MapSourceController {
  constructor(viewer, options = {}) {
    const googleApiKey =
      typeof window !== 'undefined' ? window.__GOOGLE_MAPS_API_KEY__ : '';
    const registry = createDefaultMapSources({ ...options, googleApiKey });
    // Terrain has an independent owner; imagery activation cannot fail on terrain.
    for (const source of registry.sources) delete source.terrain;
    super(viewer, {
      registry,
      initialStack: options.googleTileset
        ? options.initialStack || 'photoreal'
        : registry.defaultId,
      ...options,
      requestRender: governorRequestRender,
    });
    this.terrainSelection = new TerrainSelection(viewer, {
      hasToken: Boolean(String(options.cesiumToken || '').trim()),
      factories: {
        world: (request) => createWorldTerrain(options.cesiumToken, request),
        keyless: createKeylessTerrain,
        flat: async () => ({ provider: new Cesium.EllipsoidTerrainProvider() }),
      },
    });
    this.buildings = new BuildingsController(viewer, {
      token: options.cesiumToken,
    });
    this.googleTileset = options.googleTileset || null;
    this.cesiumToken = String(options.cesiumToken || '').trim();
  }
  async setStack(...args) {
    const state = await super.setStack(...args);
    this.buildings?.syncMapVisibility();
    this.terrainSelection?.emit();
    await this.terrainSelection?.ensure();
    return state;
  }
  destroy() {
    this.buildings?.destroy();
    this.terrainSelection?.destroy();
    super.destroy();
  }
  _hasPhotorealCredentials() {
    const googleKey =
      typeof window !== 'undefined' ? window.__GOOGLE_MAPS_API_KEY__ : '';
    return (
      Boolean(String(googleKey || '').trim()) ||
      Boolean(String(this.cesiumToken || '').trim())
    );
  }
}
