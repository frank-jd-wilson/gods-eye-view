import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { Readable } from 'node:stream';
import { taiwanFrame } from './taiwan.js';
/** Pin exact official host/path/camera and resolved public IPv4; never follow redirects. */
export function isTaiwanPublicIpv4(address) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return false;
  const [a, b, c, d] = address.split('.').map(Number);
  return (
    [a, b, c, d].every((x) => x <= 255) &&
    a > 0 &&
    a < 224 &&
    a !== 10 &&
    a !== 127 &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
    !(a === 203 && b === 0 && c === 113)
  );
}
export function isTaiwanMediaUrl(value) {
  try {
    const url = new URL(value);
    const streamPath =
      url.hostname === 'cctvs.freeway.gov.tw'
        ? '/live-view/mjpg/video.cgi'
        : '/abs2mjpg/bmjpg';
    const framePath =
      url.hostname === 'cctvs.freeway.gov.tw'
        ? '/live-view/jpg/image.cgi'
        : '/abs2mjpg/jpg';
    if (![streamPath, framePath].includes(url.pathname)) return false;
    const original = url.href;
    url.pathname = streamPath;
    const pair = taiwanFrame(url.href);
    return pair && [pair.streamUrl, pair.frameUrl].includes(original);
  } catch {
    return false;
  }
}
export async function fetchTaiwanMedia(
  value,
  options = {},
  { lookupImpl = lookup, requestImpl = https.request, timeoutMs = 15_000 } = {},
) {
  if (!isTaiwanMediaUrl(String(value)))
    throw Object.assign(new Error('Taiwan media destination refused'), {
      code: 'INVALID_RESPONSE',
    });
  const url = new URL(value);
  const deadline = new AbortController();
  const signal = AbortSignal.any(
    [options.signal, deadline.signal].filter(Boolean),
  );
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  let abortListener;
  try {
    signal.throwIfAborted();
    const addresses = await Promise.race([
      lookupImpl(url.hostname, { family: 4, all: true }),
      new Promise((_, reject) => {
        abortListener = () =>
          reject(new DOMException('Taiwan media timeout', 'TimeoutError'));
        signal.addEventListener('abort', abortListener, { once: true });
      }),
    ]);
    signal.removeEventListener('abort', abortListener);
    if (
      !addresses.length ||
      addresses.some((row) => !isTaiwanPublicIpv4(row.address))
    )
      throw new Error('Taiwan media address refused');
    return await new Promise((resolve, reject) => {
      const req = requestImpl(
        url,
        {
          method: 'GET',
          signal,
          headers: { Accept: 'multipart/x-mixed-replace,image/jpeg' },
          lookup(_host, opts, callback) {
            if (opts?.all) callback(null, addresses);
            else callback(null, addresses[0].address, 4);
          },
        },
        (res) => {
          clearTimeout(timer);
          const status = res.statusCode || 502;
          if (status >= 300 && status < 400) {
            res.destroy();
            reject(new Error('Taiwan media redirect refused'));
            return;
          }
          try {
            resolve(
              new Response(Readable.toWeb(res), {
                status,
                headers: res.headers,
              }),
            );
          } catch {
            res.destroy();
            reject(
              Object.assign(new Error('Taiwan media response invalid'), {
                code: 'INVALID_RESPONSE',
              }),
            );
          }
        },
      );
      req.on('error', () =>
        reject(new Error('Taiwan media connection failed')),
      );
      req.end();
    });
  } catch (error) {
    const code =
      deadline.signal.aborted || error?.name === 'TimeoutError'
        ? 'TIMEOUT'
        : error?.code === 'INVALID_RESPONSE' ||
            /response invalid|redirect refused|destination refused|address refused/.test(
              error?.message || '',
            )
          ? 'INVALID_RESPONSE'
          : 'NETWORK_FAILURE';
    const message =
      code === 'TIMEOUT'
        ? 'Taiwan media timeout'
        : code === 'INVALID_RESPONSE'
          ? 'Taiwan media invalid response or address refused'
          : 'Taiwan media network failure';
    throw Object.assign(new Error(message), {
      code,
      name: code === 'TIMEOUT' ? 'TimeoutError' : 'Error',
    });
  } finally {
    signal.removeEventListener('abort', abortListener);
    clearTimeout(timer);
  }
}
