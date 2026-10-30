import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mountBrandTitle } from './localePicker.js';
import {
  setLocale,
  subscribeLocale,
  persistLocaleChoice,
  getLocale,
} from '../i18n/index.js';
import { resolveLocale, LOCALE_STORAGE_KEY } from '../i18n/locale.js';
afterEach(() => setLocale('en'));
function fixture() {
  const accent = { textContent: '', className: 'title-accent' };
  const root = {
    ownerDocument: { createTextNode: (nodeValue) => ({ nodeValue }) },
    querySelector: () => accent,
    replaceChildren(...children) {
      this.children = children;
    },
    get textContent() {
      return this.children
        .map((n) => (n === accent ? n.textContent : n.nodeValue))
        .join('');
    },
  };
  return { root, accent };
}
test('brand updates synchronously both ways, uses U+FF0E and preserves accent node', () => {
  const { root, accent } = fixture();
  const stop = mountBrandTitle(root);
  try {
    assert.equal(root.textContent, 'DIGITAL TWIN．EARTH');
    assert.equal(root.lang, 'en');
    setLocale('zh-TW');
    assert.equal(root.textContent, '數 位 孿 生\uFF0E地 球');
    assert.equal(root.lang, 'zh-TW');
    assert.equal(root.textContent.codePointAt(7), 0xff0e);
    assert.deepEqual(
      [...root.textContent].flatMap((c, i) => (c === '\u0020' ? [i] : [])),
      [1, 3, 5, 9],
    );
    assert.equal(root.children[1], accent);
    assert.equal(accent.textContent, '地 球');
    setLocale('en');
    assert.equal(root.textContent, 'DIGITAL TWIN．EARTH');
    assert.equal(root.lang, 'en');
    for (const locale of ['es', 'ru', 'zh-CN', 'fr']) {
      setLocale(locale);
      assert.equal(root.textContent, 'DIGITAL TWIN．EARTH');
    }
  } finally {
    stop();
  }
});
test('initial Taiwanese brand owns its language even when the host is English', () => {
  setLocale('zh-TW');
  const { root } = fixture();
  root.lang = 'en';
  const stop = mountBrandTitle(root);
  try {
    assert.equal(root.lang, 'zh-TW');
    assert.equal(root.textContent, '數 位 孿 生．地 球');
    setLocale('en');
    assert.equal(root.lang, 'en');
  } finally {
    stop();
  }
});
test('disposed brand does not receive old notifications and remount has one active binding', () => {
  const { root } = fixture();
  const first = mountBrandTitle(root);
  first();
  setLocale('zh-TW');
  assert.equal(root.textContent, 'DIGITAL TWIN．EARTH');
  const second = mountBrandTitle(root);
  assert.equal(root.textContent, '數 位 孿 生．地 球');
  second();
  setLocale('en');
  assert.equal(root.textContent, '數 位 孿 生．地 球');
});
test('live choice keeps existing storage/URL policy and never navigates; next boot resolves saved locale', () => {
  const values = new Map();
  const storage = {
    setItem: (k, v) => values.set(k, v),
    getItem: (k) => values.get(k),
  };
  const document = { documentElement: {} };
  const history = {
    replaceState(_a, _b, url) {
      location.href = url;
    },
  };
  const location = {
    href: 'http://127.0.0.1:4175/?lang=zh-TW#v=2&map=esri-imagery',
    reload() {
      assert.fail('reload');
    },
    assign() {
      assert.fail('navigation');
    },
  };
  for (const locale of ['en', 'zh-TW']) {
    assert.equal(
      persistLocaleChoice(locale, { storage, document, history, location }),
      true,
    );
    assert.equal(values.get(LOCALE_STORAGE_KEY), locale);
    assert.equal(getLocale(), locale);
    assert.equal(document.documentElement.lang, locale);
    const url = new URL(location.href);
    assert.equal(url.searchParams.has('lang'), false);
    assert.equal(url.hash, '#v=2&map=esri-imagery');
    assert.equal(
      resolveLocale({
        storage,
        location: { search: url.search },
        languages: ['en'],
      }),
      locale,
    );
  }
});
test('blocked storage preserves the choice in the URL without navigation', () => {
  let href;
  persistLocaleChoice('zh-Hant', {
    storage: {
      setItem() {
        throw new Error('denied');
      },
    },
    document: {},
    location: { href: 'https://example.test/?x=1#view' },
    history: {
      replaceState(a, b, url) {
        href = url;
      },
    },
  });
  assert.equal(new URL(href).searchParams.get('lang'), 'zh-TW');
  assert.equal(new URL(href).hash, '#view');
});
test('locale listeners isolate failures, skip disposed listeners and do not notify unchanged state', () => {
  let count = 0;
  const a = subscribeLocale(() => count++);
  const b = subscribeLocale(() => count++);
  b();
  try {
    setLocale('zh-TW');
    setLocale('zh-TW');
    assert.equal(count, 1);
  } finally {
    a();
  }
});
