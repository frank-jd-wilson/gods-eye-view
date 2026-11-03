import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTflSourcesFromOpenData } from './sources.js';
import { TFL_IMAGE_ORIGIN } from './constants.js';

test('TfL uses official MP4 footage and retains snapshot fallback without accepting arbitrary hosts', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const videos = [
    TFL_IMAGE_ORIGIN + 'a.mp4',
    '',
    'https://evil.example/a.mp4',
    TFL_IMAGE_ORIGIN + 'a.jpg',
  ];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify(
        videos.map((video, i) => ({
          id: `JamCams_${i}`,
          commonName: `Test camera ${i}`,
          lat: 51.5,
          lon: -0.12,
          additionalProperties: [
            { key: 'available', value: 'true' },
            { key: 'imageUrl', value: TFL_IMAGE_ORIGIN + `${i}.jpg` },
            { key: 'videoUrl', value: video },
          ],
        })),
      ),
    );
  const cameras = await loadTflSourcesFromOpenData();
  assert.equal(cameras.length, 4);
  const video = cameras.find((c) => c.id === 'tfl-0');
  assert.equal(video.feedType, 'mp4');
  assert.equal(video.url, videos[0]);
  assert.equal(video.snapshotUrl, TFL_IMAGE_ORIGIN + '0.jpg');
  assert.equal(video.license, 'Powered by TfL Open Data');
  for (const id of ['tfl-1', 'tfl-2', 'tfl-3']) {
    const camera = cameras.find((c) => c.id === id);
    assert.equal(camera.feedType, 'image');
    assert.equal(camera.url, camera.snapshotUrl);
  }
});
