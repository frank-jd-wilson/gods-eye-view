import { t, msg, subscribeLocale } from '../i18n/index.js';

const choices = [
  ['world', msg('Cesium World Terrain')],
  ['keyless', msg('Free terrain (Re:Earth)')],
  ['flat', msg('Flat Earth')],
];
/** A single subscription owns both visible and collapsed terrain controls. */
export function createTerrainControls(container, owner) {
  if (!container?.ownerDocument || !owner) return { destroy() {} };
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'terrain-controls';
  const label = doc.createElement('label');
  const text = doc.createElement('span');
  const select = doc.createElement('select');
  select.dataset.terrainSelect = 'true';
  const options = choices.map(([id]) => {
    const o = doc.createElement('option');
    o.value = id;
    select.append(o);
    return o;
  });
  label.append(text, select);
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const recovery = doc.createElement('button');
  recovery.type = 'button';
  recovery.className = 'map-stack-chip';
  root.append(label, status, recovery);
  container.parentNode.append(root);
  const notice = doc.createElement('div');
  notice.className = 'terrain-error-notice';
  notice.setAttribute('role', 'status');
  const noticeText = doc.createElement('p');
  const recover = doc.createElement('button');
  recover.type = 'button';
  recover.className = 'map-stack-chip';
  notice.append(noticeText, recover);
  doc.body.append(notice);
  const render = () => {
    const state = owner.getState();
    text.textContent = t('3D Terrain');
    options.forEach((o, i) => {
      o.textContent = t(choices[i][1]);
      o.disabled = o.value === 'world' && !state.hasToken;
    });
    select.value = state.selected;
    select.disabled = state.photoreal;
    const message = state.photoreal
      ? t(
          'Google 3D supplies its own terrain. Select Esri or OSM to choose terrain.',
        )
      : state.message
        ? t(state.message)
        : '';
    status.textContent = message;
    noticeText.textContent = message;
    recovery.textContent = recover.textContent = t('Use free terrain');
    recovery.hidden = state.status !== 'error' || state.photoreal;
    notice.hidden = state.status !== 'error' || state.photoreal;
  };
  const onChange = () => {
    void owner.select(select.value);
  };
  const onRecover = () => {
    void owner.select('keyless');
  };
  select.addEventListener('change', onChange);
  recovery.addEventListener('click', onRecover);
  recover.addEventListener('click', onRecover);
  const stop = owner.subscribe(render),
    stopLocale = subscribeLocale(render);
  render();
  return {
    render,
    destroy() {
      stop();
      stopLocale();
      select.removeEventListener('change', onChange);
      recovery.removeEventListener('click', onRecover);
      recover.removeEventListener('click', onRecover);
      root.remove();
      notice.remove();
    },
  };
}
