import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_PREFERENCE_KEY,
  readMapPreference,
  saveMapPreference,
} from './preference.js';

test('keyless basemap preference survives a new reader; invalid and credentialed sources do not persist', () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  assert.equal(readMapPreference(storage), null);
  for (const id of ['osm', 'esri-imagery']) {
    assert.equal(saveMapPreference(id, storage), true);
    assert.equal(readMapPreference(storage), id);
  }
  saveMapPreference('photoreal', storage);
  assert.equal(readMapPreference(storage), null);
  values.set(MAP_PREFERENCE_KEY, 'future-source');
  assert.equal(readMapPreference(storage), null);
});

test('blocked localStorage is nonfatal for both reading and saving', (t) => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readMapPreference(blocked), null);
  assert.equal(saveMapPreference('osm', blocked), false);
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('denied');
    },
  });
  t.after(() =>
    descriptor
      ? Object.defineProperty(globalThis, 'localStorage', descriptor)
      : delete globalThis.localStorage,
  );
  assert.equal(readMapPreference(), null);
  assert.equal(saveMapPreference('osm'), false);
});
