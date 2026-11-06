import test from 'node:test';
import assert from 'node:assert/strict';
import { attachMjpegSurface } from './mjpegPlayback.js';
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function fixture() {
  const requests = [];
  let paints = 0,
    clock = 0;
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  const canvas = { getContext: () => ({ drawImage: () => paints++ }) };
  const options = {
    fetchImpl: async (_url, init) => {
      const request = { init, ended: false };
      const body = new ReadableStream({
        start(c) {
          request.controller = c;
        },
        cancel() {
          request.ended = true;
        },
      });
      requests.push(request);
      return new Response(body, {
        headers: {
          'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        },
      });
    },
    decode: async () => ({ width: 320, height: 180, close() {} }),
    now: () => (clock += 120),
    documentRef,
  };
  const encoder = new TextEncoder();
  return {
    canvas,
    options,
    requests,
    documentRef,
    feed(index = requests.length - 1) {
      const r = requests[index];
      const bytes = encoder.encode(
        (r.started ? '' : '--frame\r\n') + 'Content-Type: image/jpeg\r\n\r\n',
      );
      r.started = true;
      r.controller.enqueue(bytes);
      r.controller.enqueue(new Uint8Array([255, 216, 1, 255, 217]));
      r.controller.enqueue(encoder.encode('\r\n--frame\r\n'));
    },
    get paints() {
      return paints;
    },
  };
}
test('MJPEG decodes bounded JPEG parts and releases requests on pause, visibility and dispose', async () => {
  const f = fixture();
  let frames = 0;
  const playback = attachMjpegSurface(f.canvas, '/api/cctv/media/one', {
    ...f.options,
    onFrame: () => frames++,
  });
  f.feed();
  await settle();
  assert.equal(frames, 1);
  assert.equal(f.canvas.readyState, 2);
  assert.equal(f.canvas.videoWidth, 320);
  playback.pause();
  await settle();
  assert.equal(f.requests[0].ended, true);
  assert.equal(f.canvas.readyState, 0);
  void playback.play();
  f.feed();
  await settle();
  assert.equal(frames, 2);
  f.documentRef.hidden = true;
  f.documentRef.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(f.requests[1].ended, true);
  f.documentRef.hidden = false;
  f.documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.requests.length, 3);
  playback.dispose();
  playback.dispose();
  await settle();
  assert.equal(f.requests[2].ended, true);
  await playback.ready;
});
test('stream EOF is failure, never a frozen frame masquerading as live; format errors fall back', async () => {
  const f = fixture();
  let failures = 0;
  const playback = attachMjpegSurface(f.canvas, '/api/cctv/media/one', {
    ...f.options,
    onFailure: () => failures++,
  });
  f.feed();
  await settle();
  f.requests[0].controller.close();
  await playback.ready;
  assert.equal(failures, 1);
  assert.equal(f.canvas.readyState, 0);
  playback.dispose();
  const second = fixture();
  const bad = attachMjpegSurface(second.canvas, '/api/cctv/media/one', {
    ...second.options,
    fetchImpl: async () => new Response('<html>challenge</html>'),
    onFailure: () => failures++,
  });
  await bad.ready;
  assert.equal(failures, 2);
  bad.dispose();
});
test('oversized parts and delayed data after disposal cannot decode or repaint', async () => {
  const f = fixture();
  let failures = 0;
  const playback = attachMjpegSurface(f.canvas, '/api/cctv/media/one', {
    ...f.options,
    maxFrameBytes: 4,
    onFailure: () => failures++,
  });
  f.feed();
  await playback.ready;
  assert.equal(failures, 1);
  assert.equal(f.paints, 0);
  playback.dispose();
});

test('late JPEG decode completion cannot paint over a newer selection', async () => {
  const f = fixture();
  let resolve,
    closed = 0;
  const playback = attachMjpegSurface(f.canvas, '/api/cctv/media/old', {
    ...f.options,
    decode: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  f.feed();
  await settle();
  assert.ok(resolve);
  playback.dispose();
  resolve({
    width: 320,
    height: 180,
    close() {
      closed++;
    },
  });
  await playback.ready;
  assert.equal(f.paints, 0);
  assert.equal(closed, 1);
});

test('a stalled multipart body times out and falls back once', async () => {
  const f = fixture();
  let failures = 0;
  const playback = attachMjpegSurface(f.canvas, '/api/cctv/media/stalled', {
    ...f.options,
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener(
              'abort',
              () => controller.error(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          },
        }),
        {
          headers: {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
          },
        },
      ),
    onFailure: () => failures++,
  });
  await playback.ready;
  assert.equal(failures, 1);
  assert.equal(f.canvas.readyState, 0);
  playback.dispose();
});

test('100 repeated terminal failures and recoveries release listeners and streams', async () => {
  const f = fixture();
  const listeners = new Set();
  const add = f.documentRef.addEventListener.bind(f.documentRef);
  const remove = f.documentRef.removeEventListener.bind(f.documentRef);
  f.documentRef.addEventListener = (name, cb, opts) => {
    listeners.add(cb);
    add(name, cb, opts);
  };
  f.documentRef.removeEventListener = (name, cb) => {
    listeners.delete(cb);
    remove(name, cb);
  };
  let failures = 0;
  for (let i = 0; i < 100; i++) {
    const p = attachMjpegSurface(f.canvas, '/fixture', {
      ...f.options,
      onFailure: () => failures++,
    });
    f.feed();
    await settle();
    assert.equal(listeners.size, 1);
    f.requests.at(-1).controller.error(new Error('fixture failure'));
    await p.ready;
    assert.equal(listeners.size, 0);
    assert.equal(f.canvas.readyState, 0);
    p.dispose();
  }
  assert.equal(failures, 100);
  const recovered = attachMjpegSurface(f.canvas, '/fixture', f.options);
  f.feed();
  await settle();
  assert.equal(f.canvas.readyState, 2);
  recovered.dispose();
  await recovered.ready;
  assert.equal(listeners.size, 0);
});

test('decode errors and idle timeouts remove their visibility subscription', async () => {
  for (const mode of ['decode', 'timeout']) {
    const f = fixture();
    let subscriptions = 0;
    const add = f.documentRef.addEventListener.bind(f.documentRef);
    const remove = f.documentRef.removeEventListener.bind(f.documentRef);
    f.documentRef.addEventListener = (...args) => {
      subscriptions++;
      add(...args);
    };
    f.documentRef.removeEventListener = (...args) => {
      subscriptions--;
      remove(...args);
    };
    let failures = 0;
    const p = attachMjpegSurface(f.canvas, '/fixture', {
      ...f.options,
      timeoutMs: 5,
      decode: async () => {
        throw new Error('decode');
      },
      onFailure: () => failures++,
    });
    if (mode === 'decode') f.feed();
    else
      f.requests[0].init.signal.addEventListener('abort', () =>
        f.requests[0].controller.error(new Error('abort')),
      );
    await p.ready;
    assert.equal(subscriptions, 0);
    assert.equal(failures, 1);
    f.documentRef.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.requests.length, 1);
  }
});
