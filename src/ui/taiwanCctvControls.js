import { t } from '../i18n/index.js';
import { cameraMatchesTaiwanFilter } from '../layers/cctv/taiwanFilters.js';
/** Existing CCTV control owner provides listener teardown and locale rerenders. */
export function renderTaiwanCctvControls(owner, state) {
  const root = owner._cctvPanel?.querySelector?.('#cctv-taiwan-controls');
  if (!root) return state?.cameras || [];
  const fields = Object.fromEntries(
    ['region', 'road', 'direction', 'minKm', 'maxKm', 'playback'].map((key) => [
      key,
      root.querySelector(`[data-tw-field="${key}"]`),
    ]),
  );
  if (!owner._taiwanFilterBound) {
    owner._taiwanFilterBound = true;
    owner.listen(root, 'change', () => {
      const filter = Object.fromEntries(
        Object.entries(fields).map(([key, el]) => [key, el.value]),
      );
      if (!owner.cctv.setTaiwanFilter?.(filter))
        owner.actions.showToast?.(t('Invalid freeway kilometre range.'));
    });
  }
  const filter = state?.taiwanFilter || {};
  fields.region.options[0].textContent = t('All camera sources');
  fields.region.options[1].textContent = t('Taiwan Freeway');
  const roads = [
    ...new Set(
      (state?.cameras || []).map((c) => c.taiwan?.road).filter(Boolean),
    ),
  ].sort();
  const directionLabels = [
    t('All directions'),
    t('Northbound'),
    t('Southbound'),
    t('Eastbound'),
    t('Westbound'),
  ];
  Array.from(fields.direction.options).forEach((option, i) => {
    option.textContent = directionLabels[i];
  });
  fields.playback.options[0].textContent = t('MJPEG stream');
  fields.playback.options[1].textContent = t('JPEG snapshot');
  fields.playback.value = filter.playback || 'mjpeg';
  const previous = fields.road.value;
  const roadKey = JSON.stringify(roads) + t('All freeways');
  if (owner._taiwanRoadsKey !== roadKey) {
    owner._taiwanRoadsKey = roadKey;
    fields.road.replaceChildren();
    const doc = root.ownerDocument;
    for (const [value, label] of [
      ['', t('All freeways')],
      ...roads.map((road) => [road, road]),
    ]) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = label;
      fields.road.append(option);
    }
  }
  fields.road.value = filter.road ?? previous;
  for (const key of ['region', 'direction', 'minKm', 'maxKm'])
    fields[key].value = filter[key] ?? '';
  root.querySelector('[data-tw-details]').hidden = filter.region !== 'taiwan';
  const status = state?.taiwanStatus;
  const note = root.querySelector('[data-tw-status]');
  const label =
    status?.state === 'ok'
      ? t('Taiwan freeway source: available.')
      : status?.state === 'stale'
        ? t(
            'Taiwan freeway source: expired directory; showing cached positions.',
          )
        : status?.state === 'disabled'
          ? t('Taiwan freeway source: disabled.')
          : t('Taiwan freeway source is currently unavailable.');
  const updateTime = status?.sourceUpdatedAt || status?.updatedAt;
  note.textContent =
    label +
    (updateTime && Number.isFinite(Date.parse(updateTime))
      ? ' ' +
        t('Last successful update: {time}', {
          time: new Date(updateTime).toLocaleString(),
        })
      : '');
  if (status?.code && !['ok', 'not-loaded'].includes(status.code))
    note.textContent += ` (${String(status.code)
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 40)})`;
  return (state?.cameras || []).filter((camera) =>
    cameraMatchesTaiwanFilter(camera, filter),
  );
}
