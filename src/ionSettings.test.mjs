import test from 'node:test';
import assert from 'node:assert/strict';
import { mountIonSettings, ionDigest } from './ionSettings.js';
import { setLocale } from './i18n/index.js';
function fixture() {
  const nodes = [];
  const doc = {
    createElement(tag) {
      const e = {
        tag,
        children: [],
        handlers: new Map(),
        dataset: {},
        hidden: false,
        textContent: '',
        setAttribute(k, v) {
          this[k] = v;
        },
        append(...c) {
          this.children.push(...c);
        },
        before() {},
        addEventListener(k, v) {
          this.handlers.set(k, v);
        },
        removeEventListener(k) {
          this.handlers.delete(k);
        },
        remove() {
          this.removed = true;
        },
      };
      nodes.push(e);
      return e;
    },
  };
  const row = doc.createElement('section'),
    note = doc.createElement('p');
  const root = {
    ownerDocument: doc,
    querySelector: (s) => (s.includes('data-key-id') ? row : note),
    querySelectorAll: () => [],
  };
  const values = new Map();
  return {
    root,
    row,
    nodes,
    values,
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    },
    status: () => nodes.find((e) => e.role === 'status'),
    verify: () => nodes.find((e) => e.dataset.ionVerify),
  };
}
const flush = () => new Promise((r) => setTimeout(r, 10));
test('stored, waiting reload, applied and apply-failed states never store a token', async () => {
  const f = fixture();
  let owner = mountIonSettings(f.root, {
    token: 'mock-old',
    storage: f.storage,
  });
  assert.match(f.status().textContent, /not verified/);
  await owner.beforeSave({ CESIUM_ION_TOKEN: 'mock-new' });
  owner.saved();
  assert.match(f.status().textContent, /not active yet/);
  assert.equal(
    [...f.values.values()].some((x) => x.includes('mock-')),
    false,
  );
  owner.destroy();
  const next = fixture();
  next.values.set('gev:ion-pending:v1', await ionDigest('mock-new'));
  owner = mountIonSettings(next.root, {
    token: 'mock-new',
    storage: next.storage,
  });
  await flush();
  assert.match(next.status().textContent, /loaded after restart/);
  assert.equal(next.values.size, 0);
  owner.destroy();
  const stale = fixture();
  stale.values.set('gev:ion-pending:v1', await ionDigest('mock-new'));
  owner = mountIonSettings(stale.root, {
    token: 'mock-old',
    storage: stale.storage,
  });
  await flush();
  assert.match(stale.status().textContent, /Apply failed/);
  owner.destroy();
});
test('verification updates state, locale notification and listener disposal', async () => {
  const f = fixture();
  const owner = mountIonSettings(f.root, {
    token: 'mock-only',
    storage: f.storage,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        type: 'TERRAIN',
        url: 'https://fixture.invalid/terrain',
      }),
    }),
  });
  try {
    await f.verify().handlers.get('click')();
    assert.match(f.status().textContent, /Verified/);
    assert.equal(f.row['data-ion-verified'], 'true');
    setLocale('zh-TW');
    assert.match(f.status().textContent, /驗證成功/);
    const text = f.status().textContent;
    owner.destroy();
    setLocale('en');
    assert.equal(f.status().textContent, text);
    assert.equal(f.verify().handlers.size, 0);
  } finally {
    owner.destroy();
    setLocale('en');
  }
});
test('destroy aborts in-flight verification and ignores its late response', async () => {
  const f = fixture();
  let canceled = false;
  const owner = mountIonSettings(f.root, {
    token: 'mock-only',
    storage: f.storage,
    fetchImpl: (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => {
          canceled = true;
          reject(signal.reason);
        }),
      ),
  });
  const work = f.verify().handlers.get('click')();
  owner.destroy();
  await work;
  assert.equal(canceled, true);
});
