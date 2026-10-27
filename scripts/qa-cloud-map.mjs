#!/usr/bin/env node
/** Unmocked map/terrain/font smoke test. Requires a running dev server.
 * node scripts/qa-cloud-map.mjs --url http://127.0.0.1:4173 --out qa-artifacts/cloud-map/new-run
 * Fails on missing tiles, flat fallback terrain, missing fonts or bad heights.
 * No external request is mocked and no TLS check is disabled.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import {
  createNetworkLog,
  observePageNetwork,
} from './lib/network-diagnostics.mjs';

const option = (key, fallback) => {
  const i = process.argv.indexOf(key);
  if (i < 0) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--'))
    throw new Error(`Missing value for ${key}`);
  return process.argv[i + 1];
};
const url = new URL(option('--url', 'http://127.0.0.1:4173'));
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw new Error(
    '--url must be an HTTP(S) base URL without credentials, query or fragment',
  );
const output = option('--out', `qa-artifacts/cloud-map/${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const log = createNetworkLog(path.join(output, 'network.jsonl'));
const result = { checks: {}, passed: false };
let browser;
try {
  browser = await puppeteer.launch({
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  observePageNetwork(page, (entry) => log.write(entry));
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__godsEyeView?.mapStackController, {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    for (const family of [
      'Inter',
      'JetBrains Mono',
      'Material Symbols Outlined',
    ])
      await document.fonts.load(`16px "${family}"`);
    await document.fonts.ready;
  });
  for (const id of ['esri-imagery', 'osm']) {
    await page.evaluate(
      (stack) => window.__godsEyeView.mapStackController.setStack(stack),
      id,
    );
    let timedOut = false;
    try {
      await page.waitForFunction(
        () => window.__godsEyeView.viewer.scene.globe.tilesLoaded,
        { timeout: 45000 },
      );
    } catch {
      timedOut = true;
    }
    result.checks[id] = await page.evaluate(() => {
      const { viewer, mapStackController } = window.__godsEyeView;
      const state = mapStackController.getState();
      return {
        activeId: state.activeId,
        hasMapError: !!state.lastError,
        globeShown: viewer.scene.globe.show,
        tilesLoaded: viewer.scene.globe.tilesLoaded,
        imageryLayers: viewer.imageryLayers.length,
        terrain: viewer.terrainProvider?.constructor.name,
        fonts: Object.fromEntries(
          ['Inter', 'JetBrains Mono', 'Material Symbols Outlined'].map(
            (font) => [
              font,
              document.fonts.check(`16px "${font}"`) &&
                [...document.fonts].some(
                  (face) =>
                    face.family.replaceAll('"', '').replaceAll("'", '') ===
                      font && face.status === 'loaded',
                ),
            ],
          ),
        ),
      };
    });
    const check = result.checks[id];
    check.timedOut = timedOut;
    check.passed =
      !timedOut &&
      check.activeId === id &&
      !check.hasMapError &&
      check.globeShown &&
      check.tilesLoaded &&
      check.imageryLayers > 0 &&
      check.terrain === 'CesiumTerrainProvider' &&
      Object.values(check.fonts).every(Boolean);
    await page.screenshot({ path: path.join(output, `${id}.png`) });
  }
  result.heights = await page.evaluate(async () => {
    const response = await fetch(
      '/api/terrain/heights?points=-97.74700%2C30.26800',
    );
    const body = await response.json();
    return {
      status: response.status,
      valid:
        Array.isArray(body.results) &&
        body.results.length === 1 &&
        ['elevation', 'geoid', 'ellipsoid'].every((key) =>
          Number.isFinite(body.results[0][key]),
        ),
    };
  });
  result.passed =
    Object.values(result.checks).every((check) => check.passed) &&
    result.heights.status === 200 &&
    result.heights.valid;
} catch {
  // Detailed URLs/errors can contain credentials; the passive log has safe codes.
  result.error = 'Map smoke did not complete; inspect the hostname/status log.';
} finally {
  await browser?.close();
  log.close();
  fs.writeFileSync(
    path.join(output, 'report.json'),
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
