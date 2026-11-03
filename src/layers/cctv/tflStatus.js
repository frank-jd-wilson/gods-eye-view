import { msg, t } from '../../i18n/index.js';
const DETAILS = Object.freeze({
  'html-response': msg(
    'TfL returned a verification page instead of camera data.',
  ),
  'content-type': msg('TfL returned an unsupported response type.'),
  'http-401': msg('TfL authorization failed (401).'),
  'http-403': msg('TfL access was refused (403).'),
  'http-429': msg('TfL request limit reached (429).'),
  'http-5xx': msg('TfL service is temporarily unavailable.'),
  timeout: msg('TfL directory request timed out.'),
  network: msg('TfL directory network request failed.'),
  'invalid-json': msg('TfL returned invalid JSON.'),
  'invalid-schema': msg('TfL camera directory structure is invalid.'),
});
export function readTflStatus(rows) {
  const value = Array.isArray(rows)
    ? rows.find((row) => row?.pack === 'tfl')
    : null;
  if (
    !value ||
    !['ok', 'empty', 'unavailable', 'stale', 'disabled'].includes(value.state)
  )
    return null;
  return {
    pack: 'tfl',
    state: value.state,
    code: Object.hasOwn(DETAILS, value.code) ? value.code : value.state,
  };
}
export function tflDirectoryMessage(status) {
  if (!status || ['ok', 'disabled'].includes(status.state)) return '';
  if (status.state === 'empty')
    return t('TfL returned no available London cameras.');
  return [
    t('TfL London camera source is currently unavailable.'),
    DETAILS[status.code] ? t(DETAILS[status.code]) : '',
    status.state === 'stale'
      ? t('Showing expired camera positions only; media is unavailable.')
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
