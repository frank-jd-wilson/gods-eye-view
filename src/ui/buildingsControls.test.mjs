import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildingsControls } from './buildingsControls.js';
import { setLocale } from '../i18n/index.js';
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
  const listeners = new Set();
  const state = { enabled: false, status: 'off', coverage: 'unknown' };
  const choices = [];
  const owner = {
    getState: () => ({ ...state }),
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    async setEnabled(v) {
      choices.push(v);
      state.enabled = v;
      for (const f of listeners) f();
    },
  };
  const parent = { append() {} };
  return {
    container: { ownerDocument: doc, parentNode: parent },
    owner,
    state,
    listeners,
    choices,
    nodes,
  };
}
test('buildings control switches through owner and translates live without rebuilding nodes', async () => {
  const f = fixture();
  const control = createBuildingsControls(f.container, f.owner);
  const select = f.nodes.find((e) => e.tag === 'select'),
    title = f.nodes.find((e) => e.tag === 'span'),
    status = f.nodes.find((e) => e.role === 'status');
  assert.equal(select.value, 'off');
  assert.equal(title.textContent, '3D BUILDINGS');
  assert.equal(f.choices.length, 0);
  try {
    select.value = 'osm';
    select.handlers.get('change')();
    assert.deepEqual(f.choices, [true]);
    setLocale('zh-TW');
    assert.equal(title.textContent, '3D 建築物');
    assert.equal(select.value, 'osm');
    f.state.coverage = 'empty';
    for (const fn of f.listeners) fn();
    assert.match(status.textContent, /此視野/);
    assert.doesNotMatch(status.textContent, /載入失敗/);
    const previous = status.textContent;
    control.destroy();
    assert.equal(f.listeners.size, 0);
    assert.equal(select.handlers.size, 0);
    setLocale('en');
    assert.equal(status.textContent, previous);
  } finally {
    control.destroy();
    setLocale('en');
  }
});
