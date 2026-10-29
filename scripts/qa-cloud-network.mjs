#!/usr/bin/env node
/** Run the unchanged tracking gate with passive hostname/status diagnostics.
 * node scripts/qa-cloud-network.mjs --network-log qa-artifacts/cloud/network.jsonl
 *   --arrival-repeats 10 --arrival-report qa-artifacts/cloud/arrival.json
 * Remaining arguments go to track-regression.mjs. Its exit status is preserved.
 */
import puppeteer from 'puppeteer';
import {
  createNetworkLog,
  observePageNetwork,
} from './lib/network-diagnostics.mjs';

const index = process.argv.indexOf('--network-log');
if (
  index < 0 ||
  !process.argv[index + 1] ||
  process.argv[index + 1].startsWith('--')
)
  throw new Error('Required: --network-log <new JSONL file>');
const filename = process.argv[index + 1];
process.argv.splice(index, 2);
const log = createNetworkLog(filename);
const launch = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (...args) => {
  const browser = await launch(...args);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...pageArgs) => {
    const page = await newPage(...pageArgs);
    observePageNetwork(page, (entry) => log.write(entry));
    return page;
  };
  return browser;
};
try {
  await import('./track-regression.mjs');
} finally {
  puppeteer.launch = launch;
  log.close();
}
