# Cloud development and browser diagnostics

Use the existing checkout. Codex cloud tasks are isolated; creating another worktree is unnecessary unless requested. The saved environment's installation script runs `npm ci`, doctor and build. With system Chromium already present, `PUPPETEER_SKIP_DOWNLOAD=1 npm ci` avoids a redundant browser download. Node 24 is recommended for calibrated allocation gates.

## Start and validate

From the repository root, in this proxy-backed environment:

```sh
NODE_USE_ENV_PROXY=1 NODE_OPTIONS=--use-system-ca npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Preserve any other required `NODE_OPTIONS` when composing flags. Live processes must restart in a new task even when dependencies and built files are retained. Verify the HTML response and a meaningful service request:

```sh
curl -fsS http://127.0.0.1:4173/ -o /tmp/gev-index.html
curl -fsS 'http://127.0.0.1:4173/api/terrain/heights?points=-97.74700%2C30.26800'
```

The heights response must contain finite elevation, geoid and ellipsoid values. Curl success alone does not validate Node or Chromium networking. Node needs its supported environment proxy route and trusted CA. Chromium needs access to the existing NSS database: in this environment `/home/agent/.pki/nssdb` already contains the platform CA. A sandbox that makes the database read-only prevents Chromium from using it; use an approved execution with normal trust-store access. Never add `--ignore-certificate-errors` or disable TLS verification. Do not import arbitrary certificates.

The tested baseline requires only these custom domains, in addition to the environment's package-manager preset: `fonts.googleapis.com`, `fonts.gstatic.com`, `services.arcgisonline.com`, `terrain.reearth.land`, `tile.openstreetmap.org`. Extra live feeds and authenticated providers are separate capabilities. Explain any additional hostname, outbound data and provider trust before expanding the policy; do not use `*`.

## Repeated original arrival probes

```sh
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/qa-cloud-network.mjs \
  --network-log qa-artifacts/cloud/run-1/network.jsonl \
  --arrival-repeats 10 --arrival-report qa-artifacts/cloud/run-1/arrival.json
```

This runs the full tracking gate and repeats its original flight and military arrival probes ten times on the same page. It is a repeated-measures sample within one process, not ten independent cloud machines. Every failed attempt remains a failed runner assertion and contributes to the mean, median, nearest-rank P95 and maximum. With ten finite samples, nearest-rank P95 is the maximum. A fixture failure without a duration is counted as failed and unmeasured, not a zero-millisecond success. JSON stores raw observations and the renderer, browser, viewport and deadline metadata. Add `--arrival-diagnostics` to capture the first preRender/postRender timestamps and rotation errors passively; these observations never change the original pass/fail result. `--arrival-repeats` defaults to one, preserving the original workflow. The deadline remains 500 ms and rotation tolerances are unchanged.

Run without competing builds or suites. The deadline includes the first completed settle and reveal frames; a timeout under software rendering does not itself prove an incorrect angle. Do not classify it as random cloud variance or a program defect without repeated evidence and an appropriate control.

The wrapper observes Puppeteer responses and failed requests without intercepting or modifying them. The underlying tracking gate still uses its existing synthetic aircraft feed; this is not validation of real flight providers. Network logs record hostname, status, resource type and safe error codes. They never record paths, query strings, headers, bodies or arbitrary exception messages. Generated network logs and arrival JSON use private permissions and refuse to overwrite previous evidence. The original runner may still print diagnostic URLs to stdout; treat captured runner output and screenshots as sensitive and review them before sharing.

## Unmocked maps, terrain and fonts

```sh
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/qa-cloud-map.mjs \
  --url http://127.0.0.1:4173 --out qa-artifacts/cloud/map-1
node scripts/summarize-cloud-network.mjs qa-artifacts/cloud/map-1/network.jsonl
```

The map gate uses real requests for both Esri and OSM. It fails unless tiles complete, the selected source is active, a non-flat Cesium terrain provider is installed, all three application font families load and the point-height API returns numeric data. It saves a structured report, hostname/status events and screenshots. Screenshots may contain application/user data: keep them ignored and review before sharing.

To inspect server-side upstream requests, start a separate server with the optional preload (as a single command):

```sh
GEV_NETWORK_LOG=qa-artifacts/cloud/server-1.jsonl NODE_USE_ENV_PROXY=1 \
  node --use-system-ca --import ./scripts/observe-server-network.mjs \
  node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort
```

Stop only a server you own before reusing its port. Do not preload this observer into `npm`: both npm and its child would try to open the same new log. The observer preserves successful responses and rethrows the original fetch error; it does not alter retries or authentication. The summary command groups recorded events, including HTTP failures, TLS failures and `ERR_ABORTED` cancellations. No HTTP response means `status: null`, not an invented 403/500. A summary is informational; underlying gates supply pass/fail exit status.

## Reviewed tools and persistence

The one-off onboarding tools were reviewed and rewritten as four portable entrypoints:

| One-off tool         | Maintained replacement                |
| -------------------- | ------------------------------------- |
| `run-observed.mjs`   | `scripts/qa-cloud-network.mjs`        |
| `map-smoke.mjs`      | `scripts/qa-cloud-map.mjs`            |
| `observe-server.mjs` | `scripts/observe-server-network.mjs`  |
| `summarize.py`       | `scripts/summarize-cloud-network.mjs` |

Hardcoded checkout locations, dates, past test counts, raw paths and exception messages were removed. Shared privacy/statistics code lives in `scripts/lib`, with meaningful tests under `src/tooling`. Historical logs, certificates, screenshots and reports remain outside Git; do not copy the scratch directory into the repository.

Environment settings and code have separate lifecycles. To reuse the prepared filesystem in a new Codex task, review/save and publish the environment, select that environment for the new task, and choose the repository/ref containing the desired code. Startup instructions restart processes. A saved draft does not prove a published snapshot or a new-task restoration. To retain code permanently, commit to a Git branch, push to GitHub and merge a reviewed PR; a local branch or environment snapshot alone does not update GitHub main.

This onboarding UI does not expose localhost pages as web previews. Internal browser tests and screenshots work, but a loopback URL is not a user-facing preview. A different Codex interface may offer preview/port-forwarding controls; availability must be confirmed there. Do not expose this credential-brokering development server publicly just to manufacture a preview.

## Suggested zh-TW follow-up

Use `docs/TRANSLATORS.md` and the existing i18n tooling. First agree on a Taiwanese terminology glossary and which Chinese regional tags should resolve to Traditional Chinese. Then add a dedicated `zh-TW` catalog, register it in `src/i18n/index.js`, `src/i18n/locale.js` and `scripts/package-boundaries.json`, and document terminology under `docs/translations/zh-TW.md`. Preserve `zh-CN` as its own locale.

Translate first-run UI, menus, map/layer controls and errors, then HUD/voice-facing messages. Keep placeholders, machine values, provider names and feed data unchanged. Add locale selection/fallback tests for `zh-TW` and `zh-Hant`, and agreed mappings for `zh-HK`/`zh-MO`. Run the full catalog checks, placeholder/plural tests, build and browser checks at narrow widths; verify CJK font fallback, truncation and numbers/dates. Split glossary/locale plumbing, catalog translation and visual QA into reviewable PRs. This diagnostics PR does not implement localization.
