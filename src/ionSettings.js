import { t, msg, subscribeLocale } from './i18n/index.js';
import { verifyIonTerrain } from './maps/ionStatus.js';

const PENDING = 'gev:ion-pending:v1';
export async function ionDigest(value, cryptoImpl = globalThis.crypto) {
  const bytes = await cryptoImpl.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
/** Only a non-reversible digest crosses reload; no token goes into web storage. */
export function mountIonSettings(
  root,
  { token = '', signal, storage, fetchImpl } = {},
) {
  try {
    storage ??= globalThis.sessionStorage;
  } catch {}
  const ownedAbort = new AbortController();
  signal = signal
    ? AbortSignal.any([signal, ownedAbort.signal])
    : ownedAbort.signal;
  const doc = root.ownerDocument;
  if (!doc?.createElement)
    return {
      beforeSave: async () => {},
      saved() {},
      failed() {},
      destroy() {},
    };
  const host = doc.createElement('section');
  host.className = 'key-setup-note';
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const verify = doc.createElement('button');
  verify.type = 'button';
  verify.className = 'key-setup-apply';
  verify.dataset.ionVerify = 'true';
  const reload = doc.createElement('button');
  reload.type = 'button';
  reload.className = 'key-setup-apply';
  reload.hidden = true;
  host.append(status, verify, reload);
  root.querySelector('[data-key-setup-status]')?.before(host);
  let message = token
    ? msg('Cesium token configured, not verified.')
    : msg('No applied Cesium token. Save a token and reload the App first.');
  let verified = false;
  let disposed = false,
    pending = false,
    generation = 0;
  const render = () => {
    status.textContent = t(message);
    root
      .querySelector('[data-key-id="cesium-ion"]')
      ?.setAttribute('data-ion-verified', String(verified));
    verify.textContent = t('Verify World Terrain access');
    reload.textContent = t('Reload App to apply saved keys');
  };
  const set = (value) => {
    if (!disposed) {
      message = value;
      render();
    }
  };
  const onVerify = async () => {
    if (disposed || pending || verify.disabled) return;
    if (
      [...root.querySelectorAll('input[data-env-var]')].some(
        (e) => e.dataset.envVar === 'CESIUM_ION_TOKEN' && e.value.trim(),
      )
    ) {
      set(msg('Save the replacement token and reload before verifying.'));
      return;
    }
    const gen = ++generation;
    verify.disabled = true;
    set(msg('Verifying World Terrain access…'));
    try {
      const result = await verifyIonTerrain(token, { fetchImpl, signal });
      if (gen === generation) {
        verified = result.ok;
        set(result.message);
      }
    } catch {
      /* Disposal cancels the request. */
    } finally {
      if (!disposed && gen === generation) verify.disabled = false;
    }
  };
  const onReload = () => globalThis.location?.reload();
  verify.addEventListener('click', onVerify);
  reload.addEventListener('click', onReload);
  const unsubscribe = subscribeLocale(render);
  render();
  void (async () => {
    let expected;
    try {
      expected = storage?.getItem(PENDING);
    } catch {}
    if (!expected) return;
    const gen = generation;
    try {
      const matches = (await ionDigest(token)) === expected;
      if (disposed || pending || gen !== generation) return;
      if (matches) {
        storage?.removeItem(PENDING);
        set(
          msg(
            'Saved token loaded after restart. Verification is still required.',
          ),
        );
      } else {
        reload.hidden = false;
        set(
          msg(
            'Apply failed: the App did not load the saved token. Restart the development server and reload.',
          ),
        );
      }
    } catch {
      set(
        msg(
          'Could not confirm the saved token after restart. Verify access manually.',
        ),
      );
    }
  })();
  return {
    async beforeSave(updates) {
      if (!Object.hasOwn(updates, 'CESIUM_ION_TOKEN')) return;
      verified = false;
      pending = true;
      generation++;
      verify.disabled = true;
      try {
        storage?.setItem(
          PENDING,
          await ionDigest(updates.CESIUM_ION_TOKEN || ''),
        );
      } catch {
        /* Storage may be denied; the save still works. */
      }
    },
    saved() {
      if (pending) {
        reload.hidden = false;
        set(
          msg(
            'Saved. Waiting for App reload to apply the new token; it is not active yet.',
          ),
        );
      }
    },
    failed() {
      if (pending) {
        try {
          storage?.removeItem(PENDING);
        } catch {}
        pending = false;
        verify.disabled = false;
        set(
          msg(
            'Token save was not confirmed. Reload to check the applied configuration.',
          ),
        );
      }
    },
    destroy() {
      disposed = true;
      ownedAbort.abort();
      generation++;
      unsubscribe();
      verify.removeEventListener('click', onVerify);
      reload.removeEventListener('click', onReload);
      host.remove();
    },
  };
}
