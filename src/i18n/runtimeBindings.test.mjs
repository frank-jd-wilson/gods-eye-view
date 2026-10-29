import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentTranslations,
  bindDocumentTranslations,
  setLocale,
  t,
} from './index.js';
afterEach(() => setLocale('en'));
function element(text, attrs = {}) {
  return {
    textContent: text,
    attrs: new Map(Object.entries(attrs)),
    getAttribute(k) {
      return this.attrs.get(k) ?? null;
    },
    setAttribute(k, v) {
      this.attrs.set(k, v);
    },
  };
}
function root(nodes) {
  return {
    querySelectorAll(selector) {
      const key = selector.slice(1, -1);
      return nodes.filter((n) => n.attrs.has(key));
    },
  };
}

test('canonical markup translates repeatedly both ways, including hidden panels, without touching raw or input state', () => {
  const label = element('DATA LAYERS', { 'data-i18n': '' });
  label.hidden = true;
  const tip = element('', { 'data-i18n-title': '', title: 'Collapse panel' });
  const raw = element('Live Flights');
  raw.value = 'user search';
  raw.open = true;
  const doc = root([label, tip, raw]);
  applyDocumentTranslations(doc);
  const stop = bindDocumentTranslations(doc);
  try {
    for (let i = 0; i < 20; i++) {
      setLocale('zh-TW');
      assert.equal(label.textContent, t('DATA LAYERS'));
      assert.equal(tip.getAttribute('title'), t('Collapse panel'));
      setLocale('en');
      assert.equal(label.textContent, 'DATA LAYERS');
      assert.equal(tip.getAttribute('title'), 'Collapse panel');
      assert.equal(raw.textContent, 'Live Flights');
      assert.equal(raw.value, 'user search');
      assert.equal(raw.open, true);
      assert.equal(label.hidden, true);
    }
  } finally {
    stop();
  }
  setLocale('zh-TW');
  assert.equal(
    label.textContent,
    'DATA LAYERS',
    'destroyed binding stays inactive',
  );
});
test('bindings never revert owner-updated state to an initial static label', () => {
  const label = element('ON', { 'data-i18n': '' });
  const doc = root([label]);
  applyDocumentTranslations(doc);
  const stop = bindDocumentTranslations(doc);
  label.textContent = 'station supplied name / 30.12 / ADS-B';
  try {
    setLocale('zh-TW');
    setLocale('en');
    assert.equal(label.textContent, 'station supplied name / 30.12 / ADS-B');
  } finally {
    stop();
  }
});
test('late mounted explicit markup sources adopt the current language and return to English', () => {
  setLocale('zh-TW');
  const label = element('anything', { 'data-i18n': 'DATA LAYERS' });
  const stop = bindDocumentTranslations(root([label]));
  try {
    assert.equal(label.textContent, t('DATA LAYERS'));
    setLocale('en');
    assert.equal(label.textContent, 'DATA LAYERS');
  } finally {
    stop();
  }
});

test('sidebar remount disposes previous subscriptions and teardown stops chrome updates', async () => {
  const { StyleManager } = await import('../ui/applicationShell.js');
  const label = element('DATA LAYERS', { 'data-i18n': '' });
  const rail = root([label]);
  const previous = globalThis.document;
  let renders = 0;
  globalThis.document = {
    getElementById: (id) => (id === 'left-panel-stack' ? rail : null),
  };
  const shell = {
    _disposed: false,
    _applyRuntimeStaticHeaderText() {
      renders++;
    },
    _panelChrome: {
      _syncPanelCollapseButton() {
        assert.fail('no panels in this fixture');
      },
    },
  };
  try {
    for (let i = 0; i < 3; i++)
      StyleManager.prototype._initRuntimeSidebarLocale.call(shell);
    const initial = renders;
    setLocale('zh-TW');
    assert.equal(renders, initial + 1);
    assert.equal(label.textContent, t('DATA LAYERS'));
    for (const remove of shell._sidebarLocaleRemovers) remove();
    setLocale('en');
    assert.equal(renders, initial + 1);
  } finally {
    for (const remove of shell._sidebarLocaleRemovers || []) remove();
    globalThis.document = previous;
  }
});
