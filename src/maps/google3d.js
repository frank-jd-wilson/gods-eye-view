import { msg } from '../i18n/index.js';
const clean = (value) => String(value || '').trim();

/**
 * Decide which map provider can deliver the best startup experience.
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {'google-direct'|'google-ion'|'osm'}
 */
export function selectMapStartupRoute({
  googleApiKey = '',
  cesiumToken = '',
} = {}) {
  if (clean(googleApiKey)) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'osm';
}

/**
 * Load Google Photorealistic 3D Tiles through direct Google access when
 * configured, otherwise through Cesium ion's hosted Google asset. Direct
 * access uses a browser key, or else short-lived tokens from the app's
 * server (see googleTokens.js). If direct access fails and an ion token is
 * available, ion is the recovery path.
 *
 * @param {object} Cesium
 * @param {{googleApiKey?: string, cesiumToken?: string, googleTokens?: {token: Function}|null}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-token'|'google-ion'|'osm', errors: Error[]}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey = '', cesiumToken = '', googleTokens = null } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  const attempts = [];
  if (googleKey)
    attempts.push({
      route: 'google-direct',
      create: () => createGoogleDirectTileset(Cesium, googleKey),
    });
  else if (googleTokens)
    attempts.push({
      route: 'google-token',
      create: () => createGoogleTokenTileset(Cesium, googleTokens),
    });
  if (ionToken)
    attempts.push({
      route: 'google-ion',
      create: () => createGoogleIonTileset(Cesium, ionToken),
    });

  for (const attempt of attempts) {
    try {
      const tileset = await attempt.create();
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { tileset: null, route: 'osm', errors };
}

/** Pass credentials to the source instead of changing SDK-wide defaults. */
export function createGoogleDirectTileset(Cesium, key) {
  key = clean(key);
  if (!key) throw new Error('Google 3D requires an explicit browser key');
  // Tiles keep drawing their own texture while draped weather loads.
  return Cesium.createGooglePhotorealistic3DTileset(
    { key, onlyUsingWithGoogleGeocoder: true },
    { asynchronouslyLoadImagery: true },
  );
}

/**
 * Google 3D with short-lived tokens instead of a key. Every tile request
 * carries the token as a header; a tile refused for an expired token gets
 * the renewed one and is tried once more.
 */
export async function createGoogleTokenTileset(Cesium, tokens) {
  const token = await tokens.token();
  if (!token) {
    const error = new Error('Google 3D tokens are not offered');
    error.name = 'MissingGoogle3DCredentials';
    throw error;
  }
  const credit = Cesium.GoogleMaps.getDefaultCredit?.();
  const resource = new Cesium.Resource({
    url: `${Cesium.GoogleMaps.mapTilesApiEndpoint}v1/3dtiles/root.json`,
    headers: { Authorization: `Bearer ${token}` },
    credits: credit ? [credit] : undefined,
    retryAttempts: 1,
    async retryCallback(failed, error) {
      if (![401, 403].includes(error?.statusCode)) return false;
      const used = failed.headers.Authorization?.replace(/^Bearer /, '');
      const renewed = await tokens.token({ replacing: used });
      if (!renewed || renewed === used) return false;
      failed.headers.Authorization = `Bearer ${renewed}`;
      return true;
    },
  });
  // The settings Cesium's Google helper applies to the key route.
  return Cesium.Cesium3DTileset.fromUrl(resource, {
    cacheBytes: 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: 1024 * 1024 * 1024,
    enableCollision: true,
    // Tiles keep drawing their own texture while draped weather loads.
    asynchronouslyLoadImagery: true,
  });
}

export async function createGoogleIonTileset(
  Cesium,
  accessToken,
  { signal } = {},
) {
  accessToken = clean(accessToken);
  if (!accessToken)
    throw new Error('Google 3D through ion requires an explicit token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(2275207, {
    accessToken,
  });
  signal?.throwIfAborted();
  // Match the installed SDK's Google helper rendering/cache defaults.
  return Cesium.Cesium3DTileset.fromUrl(resource, {
    cacheBytes: 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: 1024 * 1024 * 1024,
    enableCollision: true,
    // Tiles keep drawing their own texture while draped weather loads.
    asynchronouslyLoadImagery: true,
  });
}

/** Public diagnostics are fixed text, never credential-bearing SDK errors. */
export function google3DFailure(error, tile = false) {
  const status = Number(
    error?.statusCode ||
      error?.status ||
      /(?:status(?:\s+code)?|http)\s*[:=]?\s*(401|403|429)\b/i.exec(
        String(error?.message || ''),
      )?.[1],
  );
  if (error?.name === 'MissingGoogle3DCredentials')
    return msg(
      'Google 3D needs an applied Cesium ion token with asset 2275207 access, or an existing Google provider.',
    );
  if (status === 401)
    return msg(
      'Google 3D: Cesium ion rejected the token (401). Standard mode is preserved; select Google 3D to retry.',
    );
  if (status === 403)
    return msg(
      'Google 3D: authorize asset 2275207 and check allowed URLs (403). Select Google 3D to retry.',
    );
  if (status === 429)
    return msg(
      'Google 3D: request quota or rate limit reached (429). Check usage before retrying.',
    );
  if (error?.name === 'TimeoutError')
    return msg(
      'Google 3D timed out. Standard mode is preserved; select Google 3D to retry.',
    );
  if (tile)
    return msg(
      'Google 3D tile loading failed. Returning to standard mode; select Google 3D to retry.',
    );
  return msg(
    'Google 3D could not be loaded. Check network access and asset permissions, then select Google 3D to retry.',
  );
}

/** Lazy, retryable route. Existing ion token wins over direct Google credentials. */
export function google3DFactory(
  sdk,
  { cesiumToken = '', googleApiKey = '', googleTokens = null } = {},
  { timeoutMs = 20000 } = {},
) {
  const ion = clean(cesiumToken),
    key = clean(googleApiKey);
  if (!ion && !key && !googleTokens?.token) return null;
  return async ({ signal } = {}) => {
    signal?.throwIfAborted();
    const abort = new AbortController();
    const combined = signal
      ? AbortSignal.any([signal, abort.signal])
      : abort.signal;
    const pending = Promise.resolve().then(() =>
      ion
        ? createGoogleIonTileset(sdk, ion, { signal: combined })
        : key
          ? createGoogleDirectTileset(sdk, key)
          : createGoogleTokenTileset(sdk, googleTokens),
    );
    let timer,
      expired = false;
    const dispose = (value) => {
      if (value?.destroy && !value.isDestroyed?.()) value.destroy();
    };
    pending.then(
      (value) => {
        if (expired || combined.aborted) dispose(value);
      },
      () => {},
    );
    try {
      return await Promise.race([
        pending,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            abort.abort();
            reject({ name: 'TimeoutError' });
          }, timeoutMs);
          combined.addEventListener(
            'abort',
            () => {
              if (!expired) reject({ name: 'AbortError' });
            },
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
