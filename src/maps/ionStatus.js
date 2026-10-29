import { msg } from '../i18n/index.js';

/** Never forward provider errors: they can contain credential-bearing URLs. */
export function ionFailure(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  if (status === 401)
    return msg('Verification failed: Cesium ion rejected the token (401).');
  if (status === 403)
    return msg(
      'Verification failed: check asset permissions and allowed URLs (403).',
    );
  if (error?.name === 'TimeoutError')
    return msg(
      'Cesium terrain request timed out. The previous terrain is unchanged.',
    );
  return msg(
    'Cesium terrain could not be loaded. Check network access and token permissions.',
  );
}

export async function verifyIonTerrain(
  token,
  { fetchImpl = globalThis.fetch, signal, timeoutMs = 15000 } = {},
) {
  if (!String(token || '').trim())
    return {
      ok: false,
      message: msg(
        'No applied Cesium token. Save a token and reload the App first.',
      ),
    };
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(
      'https://api.cesium.com/v1/assets/1/endpoint',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        cache: 'no-store',
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
    );
    if (!response.ok)
      return { ok: false, message: ionFailure({ status: response.status }) };
    const endpoint = await response.json();
    const resource = new URL(endpoint?.url || '');
    if (endpoint?.type !== 'TERRAIN' || resource.protocol !== 'https:') {
      return { ok: false, message: ionFailure({}) };
    }
    return {
      ok: true,
      message: msg(
        'Verified: this token can access World Terrain. Terrain tiles are checked when applied.',
      ),
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    return {
      ok: false,
      message: ionFailure(deadline.aborted ? { name: 'TimeoutError' } : error),
    };
  }
}
