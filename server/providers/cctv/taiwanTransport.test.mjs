import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import {
  fetchTaiwanMedia,
  isTaiwanMediaUrl,
  isTaiwanPublicIpv4,
} from './taiwanTransport.js';
const url = 'https://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10000';
test('Taiwan proxy accepts exact registered stream/snapshot destinations only', () => {
  assert.ok(isTaiwanMediaUrl(url));
  assert.ok(isTaiwanMediaUrl(url.replace('/bmjpg', '/jpg')));
  for (const bad of [
    url + '&target=x',
    url + '#fragment',
    url.replace('cctvn.freeway.gov.tw', 'evil.example'),
    url.replace('https:', 'http:'),
    url.replace('https://', 'https://user:secret@'),
    url.replace('/bmjpg', '/admin'),
    url.replace('freeway.gov.tw', 'freeway.gov.tw:444'),
  ])
    assert.ok(!isTaiwanMediaUrl(bad));
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    '224.0.0.1',
    '198.51.100.2',
  ])
    assert.ok(!isTaiwanPublicIpv4(ip));
  assert.ok(isTaiwanPublicIpv4('8.8.8.8'));
});
test('DNS private answers are rejected before any connection', async () => {
  let requests = 0;
  await assert.rejects(
    fetchTaiwanMedia(
      url,
      {},
      {
        lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
        requestImpl: () => requests++,
      },
    ),
    /address refused/,
  );
  assert.equal(requests, 0);
});
test('outbound socket pins public DNS and never forwards browser credentials', async () => {
  let pinned;
  const response = await fetchTaiwanMedia(
    url,
    { headers: { Authorization: 'mock', Cookie: 'mock' } },
    {
      lookupImpl: async () => [{ address: '8.8.8.8', family: 4 }],
      requestImpl: (_url, opts, callback) => {
        assert.equal(opts.headers.Authorization, undefined);
        assert.equal(opts.headers.Cookie, undefined);
        opts.lookup('ignored', {}, (_error, address) => {
          pinned = address;
        });
        const req = new EventEmitter();
        req.end = () => {
          const res = new PassThrough();
          res.statusCode = 200;
          res.headers = {
            'content-type': 'multipart/x-mixed-replace; boundary=frame',
          };
          callback(res);
          res.end('fixture');
        };
        return req;
      },
    },
  );
  assert.equal(pinned, '8.8.8.8');
  assert.equal(await response.text(), 'fixture');
});

test('DNS deadline is a sanitized Timeout, not generic network failure', async () => {
  await assert.rejects(
    fetchTaiwanMedia(
      url,
      {},
      { timeoutMs: 5, lookupImpl: () => new Promise(() => {}) },
    ),
    (error) =>
      error.code === 'TIMEOUT' &&
      error.name === 'TimeoutError' &&
      !error.message.includes('https'),
  );
});
test('network errors never disclose internal credential URLs', async () => {
  await assert.rejects(
    fetchTaiwanMedia(
      url,
      {},
      {
        lookupImpl: async () => {
          throw new Error('https://user:password@internal.invalid');
        },
      },
    ),
    (error) =>
      error.code === 'NETWORK_FAILURE' &&
      !error.message.includes('password') &&
      !error.message.includes('internal'),
  );
});
test('forbidden DNS destination classifies as Invalid Response', async () => {
  await assert.rejects(
    fetchTaiwanMedia(
      url,
      {},
      { lookupImpl: async () => [{ address: '127.0.0.1' }] },
    ),
    (error) => error.code === 'INVALID_RESPONSE',
  );
});

test('header connection deadline remains Timeout after request emits AbortError', async () => {
  await assert.rejects(
    fetchTaiwanMedia(
      url,
      {},
      {
        timeoutMs: 5,
        lookupImpl: async () => [{ address: '8.8.8.8', family: 4 }],
        requestImpl: (_url, options) => {
          const req = new EventEmitter();
          req.end = () =>
            options.signal.addEventListener('abort', () =>
              req.emit('error', new Error('secret connection details')),
            );
          return req;
        },
      },
    ),
    (error) => error.code === 'TIMEOUT' && !error.message.includes('secret'),
  );
});
