/** Only the two keyless basemaps are durable preferences, never service fallback. */
export const MAP_PREFERENCE_KEY = 'gev:basemap:v1';
const BASEMAPS = ['osm', 'esri-imagery'];

export function readMapPreference(storage) {
  try {
    storage ??= globalThis.localStorage;
    const id = storage?.getItem(MAP_PREFERENCE_KEY);
    return BASEMAPS.includes(id) ? id : null;
  } catch {
    return null;
  }
}

export function saveMapPreference(id, storage) {
  try {
    storage ??= globalThis.localStorage;
    if (!storage) return false;
    if (BASEMAPS.includes(id)) storage.setItem(MAP_PREFERENCE_KEY, id);
    else storage.removeItem(MAP_PREFERENCE_KEY);
    return true;
  } catch {
    return false;
  }
}
