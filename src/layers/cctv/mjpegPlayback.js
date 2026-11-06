/** Selected-camera MJPEG only. Decode bounded JPEG parts; EOF is not live video. */
export function attachMjpegSurface(
  canvas,
  url,
  {
    fetchImpl = (...args) => fetch(...args),
    decode = (blob) => createImageBitmap(blob),
    onFrame = () => {},
    onFailure = () => {},
    now = () => performance.now(),
    timeoutMs = 20_000,
    documentRef = globalThis.document,
    maxFrameBytes = 2 * 1024 * 1024,
  } = {},
) {
  const ctx = canvas.getContext('2d');
  let disposed = false,
    wanted = false,
    epoch = 0,
    controller = null,
    reader = null,
    timer = null;
  let paintedAt = -Infinity,
    frameCount = 0;
  Object.assign(canvas, {
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,
  });
  const encoder = new TextEncoder(),
    decoder = new TextDecoder();
  function find(data, token, offset = 0) {
    outer: for (let i = offset; i <= data.length - token.length; i++) {
      for (let j = 0; j < token.length; j++)
        if (data[i + j] !== token[j]) continue outer;
      return i;
    }
    return -1;
  }
  function halt() {
    epoch++;
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    void reader?.cancel().catch(() => {});
    reader = null;
    canvas.readyState = 0;
  }
  function pause() {
    wanted = false;
    halt();
  }
  function play() {
    wanted = true;
    if (disposed || controller || documentRef?.hidden) return Promise.resolve();
    const generation = ++epoch;
    const local = (controller = new AbortController());
    const current = () => !disposed && generation === epoch;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => local.abort(), timeoutMs);
    };
    arm();
    return (async () => {
      let localReader;
      try {
        const response = await fetchImpl(url, {
          signal: local.signal,
          cache: 'no-store',
          redirect: 'error',
        });
        if (!current()) {
          void response.body?.cancel?.().catch(() => {});
          return;
        }
        if (!response.ok) throw new Error('media');
        const type = response.headers.get('content-type') || '';
        const match =
          /^multipart\/x-mixed-replace\s*;\s*boundary=(?:"([0-9A-Za-z'()+_,./:=? -]{1,70})"|([0-9A-Za-z'+_.-]{1,70}))(?:\s*;.*)?$/i.exec(
            type,
          );
        if (!match || !response.body) throw new Error('format');
        const boundary = match[1] || match[2];
        const delimiter = encoder.encode(`\r\n--${boundary}`),
          headerEnd = encoder.encode('\r\n\r\n');
        localReader = reader = response.body.getReader();
        let buffer = new Uint8Array(0);
        while (current()) {
          const result = await localReader.read();
          if (!current()) break;
          if (result.done) throw new Error('ended');
          if (buffer.length + result.value.length > maxFrameBytes + 8192)
            throw new Error('size');
          const next = new Uint8Array(buffer.length + result.value.length);
          next.set(buffer);
          next.set(result.value, buffer.length);
          buffer = next;
          while (current()) {
            const start = find(buffer, headerEnd);
            if (start < 0) {
              if (buffer.length > 8192) throw new Error('headers');
              break;
            }
            if (start > 8192) throw new Error('headers');
            const headers = decoder.decode(buffer.subarray(0, start));
            if (!/^content-type:\s*image\/jpeg\s*$/im.test(headers))
              throw new Error('format');
            const end = find(buffer, delimiter, start + 4);
            if (end < 0) break;
            const frame = buffer.slice(start + 4, end);
            buffer = buffer.slice(end + 2);
            if (
              frame.length > maxFrameBytes ||
              frame.length < 4 ||
              frame[0] !== 255 ||
              frame[1] !== 216 ||
              frame.at(-2) !== 255 ||
              frame.at(-1) !== 217
            )
              throw new Error('decode');
            arm();
            if (now() - paintedAt < 100) continue;
            const image = await decode(
              new Blob([frame], { type: 'image/jpeg' }),
            );
            if (!current()) {
              image.close?.();
              break;
            }
            try {
              const width = Math.min(640, image.width),
                height = Math.max(
                  1,
                  Math.round((width * image.height) / image.width),
                );
              if (!width || !height) throw new Error('decode');
              if (canvas.width !== width) canvas.width = width;
              if (canvas.height !== height) canvas.height = height;
              ctx.drawImage(image, 0, 0, width, height);
              canvas.videoWidth = width;
              canvas.videoHeight = height;
              canvas.readyState = 2;
              canvas.currentTime = ++frameCount / 10;
              paintedAt = now();
              onFrame();
            } finally {
              image.close?.();
            }
          }
        }
      } catch {
        if (current()) {
          dispose();
          onFailure();
        }
      } finally {
        await localReader?.cancel().catch(() => {});
        localReader?.releaseLock();
      }
    })();
  }
  const visibility = () => {
    if (documentRef?.hidden) halt();
    else if (wanted) void play();
  };
  documentRef?.addEventListener?.('visibilitychange', visibility);
  function dispose() {
    if (disposed) return;
    disposed = true;
    pause();
    documentRef?.removeEventListener?.('visibilitychange', visibility);
  }
  Object.assign(canvas, { play, pause, load() {} });
  const ready = play();
  return { dispose, pause, play, ready };
}
