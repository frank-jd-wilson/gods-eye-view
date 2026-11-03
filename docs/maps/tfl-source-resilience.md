# TfL London source resilience (review draft)

The confirmed Windows response from `/Place/Type/JamCam` is a verification HTML page, not the camera JSON array. Previously the loader returned `[]` for both errors and successful empty results. A partial global refresh could therefore drop London while other cities remained healthy; `/api/cctv/sources` exposed no TfL-specific failure.

## Behavior

- Validate HTTP status, JSON Content-Type and a bounded response body (8 MiB). HTTP 200 HTML, invalid JSON and invalid record structure are distinct failures. Rows with missing coordinate values are discarded by normalization, never placed at zero.
- Report fixed codes only: `html-response`, `content-type`, `http-401`, `http-403`, `http-429`, `http-5xx`, `timeout`, `network`, `invalid-json`, `invalid-schema`. No HTML, raw exception, token-bearing URL, cookie or key is returned/logged by the TfL loader. Unexpected HTTP codes get a fixed numeric code.
- `/api/cctv/sources` and `/api/cctv/health` carry `sourceStatuses` for TfL: `ok`, `empty`, `unavailable`, `stale`, `disabled`. Other packs keep their existing behavior. JSON `[]` is a successful empty result, not a failed refresh.
- Existing catalog refresh remains single-flight / 15 minutes. Failed refreshes never become new healthy TfL generations. Other cities are not removed by a TfL failure.
- Stale London retention is **off by default**. An operator who has confirmed applicable TfL permissions/cache terms may set `CCTV_TFL_POSITION_RETENTION_MS` to a permitted duration. The implementation caps it at 24 hours as a technical ceiling, not a statement of legal permission. This in-memory cache is lost on server restart. Its age is measured from the last successful TfL load; failures do not renew it.
- Retained entries keep coordinates and attribution but lose media/snapshot URLs and are flagged `stalePositionOnly`. Registered frame/media/stream routes reject such entries with 503. They are not live video. Successful empty results clear the prior TfL cache; a new healthy result replaces the old snapshot.
- The CCTV panel and layer row expose TfL failures in English / zh-TW. Missing London data does not imply London has no cameras. The panel distinguishes a normal empty directory, a directory verification/error response, video connection/URL failure, and media decode failure.
- TfL MP4 success is labelled RECORDED CLIP, not LIVE. Browser MediaError code 3 is classified before player teardown clears the error. Other cities retain their existing playback behavior.

## Boundaries and limitations

This does not bypass security challenges, copy browser cookies, solve CAPTCHAs, change endpoints to undocumented mirrors, or guarantee that an API key unlocks access. `TFL_APP_KEY` remains backend-only. No real credentials are needed for tests.

Cloud previously could not reach the official TfL API due to its own CONNECT proxy rejection (403, no origin HTTP response). No real London media recovery is claimed. Official API registration/access policy and caching permission still require TfL confirmation.

The existing frontend catalog is constructed at layer initialization; health updates can show later source failures and stop TfL video, but a fresh page load is required to instantiate a newly recovered server catalog and its latest positions. This change does not rebuild the App or Cesium Viewer during recovery. A reload likewise removes session-held entries after server-side retention expires. Do not describe the current in-session catalog as freshly downloaded solely because health is `ok`.

## Windows 11 / Edge acceptance

The changes are intentionally uncommitted and unpushed pending review. A normal `git pull` cannot retrieve them yet. Do not overwrite local modifications. Once the reviewed changes are made available locally:

1. Stop the dev server with Ctrl+C; run `git status --short`, `git branch --show-current`, and `git rev-parse HEAD`. Use only `feature/tfl-cctv-source-resilience`.
2. Start `npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort`. Open `http://127.0.0.1:4175/?lang=zh-TW` in Edge, then Ctrl+F5.
3. Open Cameras. While the verified upstream challenge persists, expect a TfL-unavailable/verification notice. Verify another city's markers/playback still work. Repeat in English.
4. Inspect `http://127.0.0.1:4175/api/cctv/sources`: look only at `sourceStatuses`, London counts and `stalePositionOnly`, not credentials. A 200 response from this local aggregate does not mean every upstream succeeded.
5. No prior healthy London cache: show unavailable, do not fabricate coordinates or substitute Street View as TfL footage.
6. Only after confirming cache permission, test an allowed TTL with a previously successful directory: failure should retain position-only records, preserve their original `updatedAt`, reject media and expire on schedule. Do not change the real service or attempt to trigger upstream rate limits just to simulate errors; use automated fixtures for failure cases.
7. After TfL officially restores JSON access, wait for the normal catalog refresh (or restart the server), reload Edge, and verify `ok` or legitimate `empty`, current street coordinates and official media separately. A decoded video frame and advancing playback time must be verified before marking real footage PASS.
8. For an invalid media URL expect a connection/URL message; for a MediaError decode failure expect a decode message. Any snapshot fallback remains a snapshot. TfL clips are refreshed recorded footage, not continuous live streaming.
9. Regression: Google/Esri switching, Terrain, Buildings, Radio Browser, brand, and language controls remain available. Do not repeatedly retry Google if its existing 429 limit is active.

No commit, push, PR creation, merge, or main modification is part of this review draft.
