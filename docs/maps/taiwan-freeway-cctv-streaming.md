# Taiwan freeway CCTV — implementation review / Windows UAT

## Baseline and scope

Branch `feature/taiwan-freeway-cctv-streaming` starts from
`1d5796f62993c08d322cdaef090e0130c2ced669`, which includes TfL resilience.
The initial working tree was clean. This work is intentionally uncommitted and
unpushed pending review. No PR, main change, or merge is authorized.

The existing `server/providers/cctv/taiwan.js` remains the Taiwan catalog loader.
It uses the existing MOTC 2.0 XML field names: CCTVID, PositionLat, PositionLon,
RoadName, RoadDirection, LocationMile, and RoadSection Start/End. Stable IDs remain
`tw-freeway-<server>-<camera>`. Original CCTVID, road, direction, raw mile and parsed
kilometres are now retained separately. Carriageway direction is not a surveyed
camera heading: the existing low-confidence pose is preserved.

## Official evidence still pending

The user-specified dataset and TDX documentation are:

- https://data.gov.tw/dataset/37665
- https://tdx.transportdata.tw/api-service/swagger/basic/7f07d940-91a4-495d-9465-1c9df89d709c

The existing download candidate is:
`https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml`.
Cloud access to this URL was rejected by the environment CONNECT proxy with 403;
no origin HTTP response was obtained (curl HTTP 000). This is not evidence that
the official service has failed. Current official field format, publication
interval, actual media MIME, endpoint validity and usage/cache terms remain to
be verified on Windows or with an official sample. Tests use the repository's
MOTC schema fixtures, not freshly downloaded official XML.

Existing attribution references Taiwan's Open Government Data License 1.0.
This implementation does not independently establish that this license covers
all current media, redistribution, commercial use, or the retained-cache period.
Confirm those conditions before public deployment. No TDX credentials are
introduced, and no security challenge, authentication or TLS check is bypassed.

## Source and security behavior

- Catalog reads are bounded to 6 MiB and 15 seconds, require an XML Content-Type
  and CCTVList structure, and reject DTD/entity declarations. Invalid or absent
  coordinates never produce a camera at 0,0.
- The existing default cap is 600 Taiwan cameras (configurable up to 2,000), plus
  the global fair catalog cap. Duplicate identities are deduplicated.
- Existing in-memory last-success retention remains bounded to 24 hours and
  failure backoff to one hour. This technical bound is not a legal permission.
  Failures retain the original successful timestamp and expose stale/unavailable
  status; they never masquerade as a successful update. Expired Taiwan entries
  are excluded from the global stale fallback, while other cities are preserved.
- `/api/cctv/sources` and `/api/cctv/health` carry Taiwan source state, a safe
  failure code, successful retrieval time and source publication time if present.
  HTTP, response type/body, XML and timeout/network stages are distinguished
  without logging raw URL-bearing exception text.
- Only registered camera IDs can reach media. Exact HTTPS host/path/camera pairs
  are accepted for cctvn, cctvn5, cctvc and cctvs under freeway.gov.tw. URLs are
  reconstructed to omit arbitrary parameters, credentials and fragments.
- Taiwan media resolves public IPv4 addresses, rejects private/reserved answers,
  pins the socket lookup to the approved answer and preserves TLS hostname
  validation. Redirects are refused. IPv6-only connectivity is not implemented;
  failure is shown/falls back, rather than weakening address checks.
- JPEG uses the registered snapshot path. MJPEG must pass the existing backend
  multipart MIME/boundary check and the frontend's bounded JPEG-part decoder.
  HTML or a single JPEG at a stream URL is not treated as live MJPEG.

## Playback and performance

The selected Taiwan camera may use MJPEG or explicit JPEG snapshot mode in the
existing Cameras panel. MJPEG uses one selected-camera request; previous requests
are cancelled before a new decoder is constructed. A parser decodes actual JPEG
parts into a shared canvas used by the panel and existing Cesium projection.
Rendering is capped at 10 fps and 640 pixels wide, with bounded part/header
buffers. EOF, malformed data, decode failure and a 20-second no-frame deadline
fall back once to JPEG with an explicit message. Hidden documents pause the
stream; source switches, Off and teardown release it. No infinite retry loop,
background stream pool, FFmpeg server or additional playback dependency is added.

Existing billboard/horizon handling, staggered geometry queue and 20–40-card LOD
remain. The new source/road/direction/kilometre filters restrict markers,
coverage, ambient cards, selection list and nearest/next/previous navigation.
They do not reinitialize Cesium or modify the map camera. No claim is made that
GPU performance or all real freeway streams have been measured in Cloud.

A successful directory does not prove a live stream. Snapshots are not labelled
LIVE; a stopped multipart response is not retained as a frozen live display.
The frontend still initializes a catalog once per page: source health changes
can update the status, but a newly recovered catalog/coordinates require F5.

## Windows 11 / Firefox / Edge acceptance

These changes cannot be obtained with git pull until approved and committed.
Do not overwrite local modifications or reinstall a working environment.

Once the reviewed changes are available locally:

1. Stop the dev server with Ctrl+C. Check `git status --short`, branch and HEAD.
2. Run `npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort` from
   `F:\Digital Twin\gods-eye-view`.
3. Open `http://127.0.0.1:4175/?lang=zh-TW`, Ctrl+F5, and open Cameras.
4. Inspect `/api/cctv/sources` for `pack=taiwan`, `taiwan` metadata and Taiwan's
   `sourceStatuses`. If unavailable, report the safe code; do not infer failure
   from Cloud's proxy rejection or invent camera locations.
5. Choose 台灣國道 / Taiwan Freeway. Filter road, N/S/E/W travel direction and a
   kilometre range; check camera coordinates against the actual official data.
   Unknown mile strings remain raw and are excluded from numeric range matches.
6. Select a camera and choose MJPEG. Verify actual network Content-Type/boundary,
   multiple decoded frames and visible road activity. A moving synthetic fixture
   is not official live-media acceptance. A stationary real scene alone also
   cannot prove the stream has stopped.
7. Choose JPEG snapshot: the stream must stop and the source must not say LIVE.
   Restore MJPEG; switch between two cameras ten times. Only the selected stream
   may remain; Off or a hidden tab must cancel it.
8. Use controlled local fixtures for HTML, 403, EOF, timeout and decode failures.
   Check the JPEG fallback message. Do not overload or deliberately break the
   public service to create failures.
9. Confirm stale status retains original timestamps and other cities remain
   available. On official recovery, refresh/reload and verify new coordinates.
10. Repeat in Firefox and Edge, in English and zh-TW, at desktop and narrow panel
    widths. Regress Google/Esri, Terrain/Buildings, TfL and other CCTV, Radio,
    voice controls, Logo and Splash. Google quota limitations remain separate.

Official XML and live media, Windows browser behavior, current licensing and
cache policy are all pending manual confirmation. No real-media PASS is claimed.

## Seven review findings — repair scope (2026-11-06)

All pre-existing 35 changed/untracked files were preserved. The branch and HEAD
remain `feature/taiwan-freeway-cctv-streaming` and
`1d5796f62993c08d322cdaef090e0130c2ced669`. No commit, staging, push or PR is
part of this repair. The previously clean baseline statement above refers to
initial Taiwan implementation, not this follow-up repair.

1. **Projection ownership:** destruction removes a runtime from the owning list
   and record, removes its Cesium entity, detaches native-video handlers,
   disposes playback and clears image handlers, canvas dimensions, double buffers,
   signature pixels and large references. Bulk destruction iterates a copy so
   removing one entry cannot skip the next entity.
2. **Complete XML:** pinned `saxes@6.0.0` validates the complete document before
   row extraction or successful-cache mutation. Invalid nesting, truncation,
   extra roots and DTD declarations fail. A well-formed empty CCTVList is an
   authoritative successful empty result; nonempty but entirely unusable rows
   remain an error. Malformed downloads preserve the last good catalog and
   successful timestamp; later valid downloads recover normally.
3. **HUD filtering:** detectable-camera sampling applies the same Taiwan
   road/direction/kilometre predicate before stride/budget sampling. Other
   countries remain available when Taiwan filtering is not selected.
4. **Image provenance:** JPEG mode preserves backend `streetview`, `synthetic`
   or `snapshot` kind and messages. An old live-stream health result becomes
   unknown instead of falsely describing a replacement image as live.
5. **MJPEG lifecycle:** terminal failure disposes the visibility subscription
   and decoder before image fallback. Hide pauses/cancels the active stream;
   one intentionally owned visibility subscription permits resume on return.
   Off, selection/source switches and destruction dispose that subscription.
6. **Taiwan-only relay budgets:** four concurrent sessions per backend instance,
   including pending connections; maximum five-minute total lifetime from
   admission; 15-second idle deadline; maximum 64 MiB actually passed through
   the relay per session (not just a declared Content-Length). Backpressure does
   not extend Taiwan's idle deadline indefinitely. Limit/EOF/disconnect releases
   the upstream and slot; concurrency refusal returns 429 with Retry-After.
   These limits do not apply to TfL or other countries. A limit ends the stream
   and permits honest image fallback; there is no automatic endless reconnect.
7. **Transport classification:** connect/DNS deadline returns safe TIMEOUT;
   network/TLS failures return NETWORK_FAILURE; invalid responses/destinations
   return INVALID_RESPONSE. No raw exception, credential URL or upstream HTML
   is forwarded or logged. DNS pinning, exact destinations, TLS validation and
   redirect refusal remain in force.

### Repeatable automated evidence

- `src/data/cctvTaiwan.test.mjs`: full XML, missing root/CCTV closing tags,
  mismatched nesting, truncated documents/second camera, valid empty directory,
  unchanged successful cache/time after rejection and recovery.
- `src/layers/cctv/taiwanResilience.test.mjs`: 100 playback switches with fixed
  runtime count and cleared disposed references/entities; HUD filtering and
  snapshot/Street View/synthetic provenance.
- `src/layers/cctv/mjpegPlayback.test.mjs`: 100 failure/recovery cycles,
  visibility-listener cleanup, decode and idle failures, late decode after
  disposal, normal playback and hidden/visible transitions.
- `server/providers/cctv/taiwanLimits.test.mjs`: admission/session lifetime,
  actual bytes without Content-Length, idle cancellation and explicit end.
- `server/providers/cctv/taiwanTransport.test.mjs`: exact allowlist, DNS pinning,
  credential isolation, DNS/header timeout and sanitized network errors.

These tests use controlled fixtures. They do not establish official connectivity,
real camera motion, cache/redistribution permission, Windows Edge behavior or
long-duration production memory stability. Windows acceptance above remains
required; include 100 JPEG/MJPEG switches and inspect Network for one selected
stream, closure on hidden/Off, and no false LIVE on image fallback. Simulate
limits/faults locally rather than overloading official servers.

The new server XML dependency must be installed after eventual approved delivery
with `npm.cmd ci` (or the project's approved lockfile installation procedure).
There is currently nothing new to obtain via git pull because this repair is
intentionally uncommitted.
