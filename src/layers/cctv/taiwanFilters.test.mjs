import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraMatchesTaiwanFilter } from './taiwanFilters.js';
import { mileKm } from '../../../server/providers/cctv/taiwan.js';
test('Taiwan filters retain road direction and kilometre boundaries without affecting all-source mode', () => {
  const camera = { taiwan: { road: '國道1號', direction: 'S', km: 123.456 } };
  assert.equal(mileKm('123K+456'), 123.456);
  assert.equal(mileKm('123.456'), 123.456);
  assert.equal(mileKm('unknown'), null);
  assert.ok(
    cameraMatchesTaiwanFilter(camera, {
      region: 'taiwan',
      road: '國道1號',
      direction: 'S',
      minKm: 123,
      maxKm: 124,
    }),
  );
  assert.ok(
    !cameraMatchesTaiwanFilter(camera, { region: 'taiwan', direction: 'N' }),
  );
  assert.ok(
    !cameraMatchesTaiwanFilter(camera, { region: 'taiwan', maxKm: 100 }),
  );
  assert.ok(!cameraMatchesTaiwanFilter({}, { region: 'taiwan' }));
  assert.ok(cameraMatchesTaiwanFilter({}, { region: '' }));
});
