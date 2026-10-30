import { t, msg, subscribeLocale } from '../i18n/index.js';

export function createBuildingsControls(container, owner) {
  if (!container?.ownerDocument || !owner) return { destroy() {} };
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'terrain-controls buildings-controls';
  const label = doc.createElement('label');
  const title = doc.createElement('span');
  const select = doc.createElement('select');
  select.dataset.buildingsSelect = 'true';
  const off = doc.createElement('option');
  off.value = 'off';
  const osm = doc.createElement('option');
  osm.value = 'osm';
  select.append(off, osm);
  label.append(title, select);
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.className = 'map-stack-chip';
  root.append(label, status, retry);
  container.parentNode.append(root);
  const render = () => {
    const s = owner.getState();
    title.textContent = t('3D BUILDINGS');
    off.textContent = t('Off');
    osm.textContent = t('Cesium OSM Buildings');
    select.value = s.enabled ? 'osm' : 'off';
    let message;
    if (!s.enabled) message = msg('Buildings are off.');
    else if (s.message) message = s.message;
    else if (s.suspended)
      message = msg(
        'OSM Buildings are hidden in Google 3D. Select Esri or OSM to show them.',
      );
    else if (s.status === 'loading') message = msg('Loading OSM Buildings…');
    else if (s.coverage === 'empty')
      message = msg(
        'No visible building features in this view. Zoom into a mapped city; this is not a network error or proof that the whole region has no data.',
      );
    else if (s.coverage === 'visible')
      message = msg(
        'Building features are visible. Imagery and terrain remain enabled.',
      );
    else
      message = msg(
        'Buildings tileset loaded. Zoom into a city and tilt the camera to inspect coverage.',
      );
    status.textContent = t(message);
    retry.textContent = t('Retry buildings');
    retry.hidden = s.status !== 'error';
  };
  const onChange = () => {
    void owner.setEnabled(select.value === 'osm');
  };
  const onRetry = () => {
    void owner.setEnabled(true);
  };
  select.addEventListener('change', onChange);
  retry.addEventListener('click', onRetry);
  const stop = owner.subscribe(render),
    stopLocale = subscribeLocale(render);
  render();
  return {
    destroy() {
      stop();
      stopLocale();
      select.removeEventListener('change', onChange);
      retry.removeEventListener('click', onRetry);
      root.remove();
    },
  };
}
