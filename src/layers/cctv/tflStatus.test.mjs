import test from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../i18n/index.js';
import { readTflStatus, tflDirectoryMessage } from './tflStatus.js';
test('English and Taiwanese directory diagnostics distinguish failure, stale positions and valid empty data', () => {
  try {
    for (const locale of ['en', 'zh-TW']) {
      setLocale(locale);
      const status = readTflStatus([
        {
          pack: 'tfl',
          state: 'unavailable',
          code: 'html-response',
          html: 'secret',
        },
      ]);
      assert.ok(!JSON.stringify(status).includes('secret'));
      assert.match(
        tflDirectoryMessage(status),
        locale === 'en' ? /verification page/ : /驗證頁面/,
      );
      assert.match(
        tflDirectoryMessage({ ...status, state: 'stale' }),
        locale === 'en' ? /positions only/ : /過期/,
      );
      assert.match(
        tflDirectoryMessage({ state: 'empty' }),
        locale === 'en' ? /no available/ : /沒有可用/,
      );
      assert.equal(tflDirectoryMessage({ state: 'ok' }), '');
      assert.ok(
        !tflDirectoryMessage(
          readTflStatus([
            { pack: 'tfl', state: 'unavailable', code: 'secret-url' },
          ]),
        ).includes('secret-url'),
      );
    }
  } finally {
    setLocale('en');
  }
});
