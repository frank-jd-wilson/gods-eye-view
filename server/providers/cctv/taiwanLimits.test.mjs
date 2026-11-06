import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createTaiwanStreamLimiter, proxyMediaResponse } from './media.js';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function response() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  res.writeHead = () => res;
  res.bytes = () => Buffer.concat(chunks).length;
  return res;
}
test('Taiwan admission bound counts pending sessions and releases on finish, close and deadline', async () => {
  const limiter = createTaiwanStreamLimiter({
    maxConcurrent: 2,
    sessionMs: 20,
  });
  const one = response(),
    two = response();
  const a = limiter.acquire(one),
    b = limiter.acquire(two);
  assert.equal(limiter.active, 2);
  assert.equal(limiter.acquire(response()), null);
  one.end();
  await wait(1);
  assert.equal(a.signal.aborted, true);
  assert.equal(limiter.active, 1);
  await wait(40);
  assert.equal(b.signal.aborted, true);
  assert.equal(limiter.active, 0);
  a.release();
  b.release();
  assert.equal(limiter.active, 0);
});
test('Taiwan relay counts actual bytes without Content-Length and cancels on cap', async () => {
  let cancelled = false,
    transferred = 0;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(8));
      c.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  const res = response();
  await proxyMediaResponse(res, new Response(body), {
    maxBytes: 10,
    onBytes: (n) => (transferred = n),
    idleTimeoutMs: 100,
  });
  await wait(20);
  assert.equal(transferred, 8);
  assert.equal(res.bytes(), 8);
  assert.equal(cancelled, true);
  assert.equal(res.writableEnded, true);
});
test('Taiwan idle cap releases upstream and admission slot', async () => {
  let cancelled = false;
  const res = response();
  const limiter = createTaiwanStreamLimiter();
  limiter.acquire(res);
  await proxyMediaResponse(
    res,
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
    { maxBytes: 100, idleTimeoutMs: 5 },
  );
  await wait(30);
  assert.equal(cancelled, true);
  assert.equal(limiter.active, 0);
});

test('ending a bounded relay releases its still-open upstream immediately', async () => {
  let cancelled = false;
  const res = response();
  await proxyMediaResponse(
    res,
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
    { maxBytes: 100, idleTimeoutMs: 10000 },
  );
  res.end();
  await wait(10);
  assert.equal(cancelled, true);
});
