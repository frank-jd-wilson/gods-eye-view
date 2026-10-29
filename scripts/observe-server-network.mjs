/** Opt-in Node preload; no headers, credentials, URL paths or error messages.
 * GEV_NETWORK_LOG=qa-artifacts/cloud/server.jsonl NODE_USE_ENV_PROXY=1 node
 *   --use-system-ca --import ./scripts/observe-server-network.mjs
 *   node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort
 * Put the command on one line; use a new log file. Do not preload into npm.
 */
import { createNetworkLog, networkEvent } from './lib/network-diagnostics.mjs';
if (!process.env.GEV_NETWORK_LOG)
  throw new Error('GEV_NETWORK_LOG must name a new log file');
const log = createNetworkLog(process.env.GEV_NETWORK_LOG);
const original = globalThis.fetch;
globalThis.fetch = async function (input, ...args) {
  const url =
    typeof input === 'string' || input instanceof URL
      ? String(input)
      : input?.url;
  try {
    const response = await original.call(this, input, ...args);
    log.write(
      networkEvent({ event: 'response', url, status: response.status }),
    );
    return response;
  } catch (error) {
    log.write(
      networkEvent({
        event: 'requestfailed',
        url,
        error: error.cause?.code || error.code,
      }),
    );
    throw error;
  }
};
process.once('exit', () => log.close());
