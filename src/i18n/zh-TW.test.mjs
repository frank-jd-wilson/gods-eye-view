import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentLanguage,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  resolveLocale,
  writeStoredLocale,
} from './locale.js';
import {
  formatDate,
  getCatalog,
  setLocale,
  t,
  tn,
  translateKnown,
} from './index.js';

afterEach(() => setLocale('en'));

test('Traditional tags select Taiwanese copy and explicit script wins over region', () => {
  for (const tag of [
    'zh-TW',
    ' ZH_tw ',
    'zh-Hant',
    'zh-Hant-TW',
    'zh-Hant-HK',
    'zh-HK',
    'zh-MO',
    'zh-Hant-CN',
  ])
    assert.equal(normalizeLocale(tag), 'zh-TW', tag);
  for (const tag of [
    'zh',
    'zh-CN',
    'zh-SG',
    'zh-Hans',
    'zh-Hans-SG',
    'zh-Hans-TW',
    'zh-Hans-HK',
  ])
    assert.equal(normalizeLocale(tag), 'zh-CN', tag);
  assert.equal(normalizeLocale('xx-TW'), null);
  assert.equal(normalizeLocale('en-TW'), 'en');
});

test('Traditional query, stored choice and browser language keep existing precedence', () => {
  const storage = { getItem: () => 'zh-CN' };
  assert.equal(
    resolveLocale({
      location: { search: '?lang=zh-Hant' },
      storage,
      languages: ['en'],
    }),
    'zh-TW',
  );
  assert.equal(
    resolveLocale({
      location: { search: '?lang=en' },
      storage: { getItem: () => 'zh-TW' },
      languages: ['zh-TW'],
    }),
    'en',
  );
  assert.equal(
    resolveLocale({
      location: { search: '' },
      storage: { getItem: () => 'zh-TW' },
      languages: ['zh-CN'],
    }),
    'zh-TW',
  );
  assert.equal(
    resolveLocale({
      location: { search: '?lang=unknown' },
      storage: { getItem: () => null },
      languages: ['de', 'zh-Hant'],
    }),
    'zh-TW',
  );
  assert.equal(
    resolveLocale({
      location: { search: '' },
      storage: { getItem: () => null },
      languages: ['de'],
    }),
    'en',
  );
});

test('stored aliases and document language use the canonical zh-TW tag', () => {
  const saved = new Map();
  assert.equal(
    writeStoredLocale('zh-Hant', {
      setItem: (key, value) => saved.set(key, value),
    }),
    true,
  );
  assert.equal(saved.get(LOCALE_STORAGE_KEY), 'zh-TW');
  const doc = { documentElement: {} };
  applyDocumentLanguage(doc, 'zh-Hant');
  assert.deepEqual(doc.documentElement, { lang: 'zh-TW', dir: 'ltr' });
});

test('priority menus, settings, layers, loading and errors use Taiwanese terms', () => {
  setLocale('zh-TW');
  for (const [source, expected] of [
    ['Choose your first view', '選擇初始視角'],
    ['EXPLORE MANUALLY', '手動探索'],
    ['LIVE CONTACTS', '即時目標'],
    ['Settings', '設定'],
    ['DATA LAYERS', '資料圖層'],
    ['MAP SOURCE', '地圖來源'],
    ['SAVE KEYS', '儲存金鑰'],
    ['LOADING', '載入中'],
    ['TIMEOUT', '逾時'],
    ['Search failed', '搜尋失敗'],
    ['PARAMETERS', '參數'],
  ])
    assert.equal(t(source), expected);
  assert.equal(
    t('Save failed: {detail}', { detail: 'EACCES' }),
    '儲存失敗：EACCES',
  );
});

test('Traditional and Simplified catalogs stay independent and switching back keeps English', () => {
  assert.notEqual(getCatalog('zh-TW'), getCatalog('zh-CN'));
  assert.equal(getCatalog('zh-Hant'), getCatalog('zh-TW'));
  setLocale('zh-CN');
  assert.equal(t('Settings'), '设置');
  setLocale('zh-TW');
  assert.equal(t('Settings'), '設定');
  setLocale('en');
  assert.equal(t('Settings'), 'Settings');
  setLocale('ru');
  assert.equal(t('Settings'), getCatalog('ru').Settings);
  setLocale('es');
  assert.equal(t('Settings'), getCatalog('es').Settings);
});

test('Traditional missing or empty entries use English without borrowing Simplified', () => {
  setLocale('zh-TW');
  assert.equal(
    t('Uncatalogued {value}', { value: 'ADS-B' }),
    'Uncatalogued ADS-B',
  );
  const catalog = getCatalog('zh-TW'),
    saved = catalog.Settings;
  try {
    delete catalog.Settings;
    assert.equal(t('Settings'), 'Settings');
    catalog.Settings = '';
    assert.equal(translateKnown('Settings'), 'Settings');
  } finally {
    catalog.Settings = saved;
  }
});

test('Traditional plural entries retain counts and interpolation; dates use zh-TW', () => {
  setLocale('zh-TW');
  for (const count of [0, 1, 2, 12])
    assert.equal(
      tn(
        count,
        'POWER UP · {count} KEY WAITING',
        'POWER UP · {count} KEYS WAITING',
      ),
      `啟用服務 · ${count} 組金鑰待設定`,
    );
  const date = new Date('2026-10-27T08:00:00Z');
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  };
  assert.equal(
    formatDate(date, options),
    new Intl.DateTimeFormat('zh-TW', options).format(date),
  );
});
