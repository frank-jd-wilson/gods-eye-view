# Development instructions

## Setup and validation

- Use Node.js 24.14+ in the 24.x line or Node 26.x, as declared in `package.json`. Allocation gates are calibrated for Node 24; use that line for release validation.
- Install with `npm ci`; preserve the lockfile. Set `PUPPETEER_SKIP_DOWNLOAD=1` only when a usable browser is already installed. Run `npm run doctor`.
- Start with `npm run dev`. In a proxy-backed Codex cloud environment, use the tested proxy/CA startup command in [docs/CLOUD-DEVELOPMENT.md](docs/CLOUD-DEVELOPMENT.md). Cloud tasks are already isolated; do not create a Git worktree unless requested.
- Before a PR, run `npm run format:check`, `npm run check:boundaries`, `npm test`, `npm run build`, and the feature gate relevant to the change. Tracking changes require a running server and `npm run test:track`. See `CONTRIBUTING.md` and `TESTING.md`.
- Capture runner exit codes and final counts. Report failures, skips, timeouts and unrun checks separately. Never weaken assertions, increase a deadline or mock a failing dependency merely to make a check pass.
- Browser performance gates should run without simultaneous builds or CPU-heavy suites. Keep individual timing observations, including failures; use the repeated-arrival diagnostics documented below when investigating the 500 ms gate.

## Changes

- Read `CONTRIBUTING.md`, `docs/CURRENT-STATE.md` and the applicable feature documentation before changing behavior. Use existing scripts and focused owners: assembly in `src/app`, UI in `src/ui`, sources in `src/sources`, layers in `src/layers`, operations in `src/services`.
- Keep changes focused. Do not change application source, tests, manifests or lockfiles for an environment-only setup task; an explicitly authorized coding task may change those files as needed.
- Preserve user changes and existing files. Do not reset, overwrite or remove unrelated work. New layers must preserve published share-link tokens and reservation history.
- Add meaningful tests for changed behavior. Tests belong under the runner's discovered `src` or `server` roots; code under `scripts/lib` can be covered by focused tooling tests in `src/tooling`.
- For translations follow `docs/TRANSLATORS.md`. Preserve interpolation names, machine identifiers, API/schema fields, feed data, attribution and user text. Traditional Chinese requires its own locale, not a silent mapping to Simplified Chinese.

## Credentials and artifacts

- Never commit credentials, `.env` files, raw process environments, browser profiles, certificate databases or diagnostic artifacts. Keep output in ignored `qa-artifacts/` directories and review it before sharing.
- Network diagnostics must omit headers, request/response bodies, URL userinfo, paths, query strings, fragments and arbitrary exception messages. Preserve hostname, HTTP status and safe error codes; a TLS failure has no HTTP status.
- Reuse injected authentication. Inspect binding presence without printing values. Keep TLS verification and the restricted network policy; explain the purpose and risks of additional domains before requesting them.
- Chromium must be able to use its existing NSS trust database. A read-only NSS mount can cause false CA errors; diagnose permissions rather than bypassing certificate checks.

## Review

- Work on a task branch and prepare a PR with the actual problem, resulting behavior and test evidence. Do not merge without the user's review.
- Follow [docs/CLOUD-DEVELOPMENT.md](docs/CLOUD-DEVELOPMENT.md) for reusable cloud diagnostics and the development/publication distinction.
