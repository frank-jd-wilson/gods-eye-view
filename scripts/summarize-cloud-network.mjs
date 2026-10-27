#!/usr/bin/env node
/** Print sanitized counts/failures from one or more JSONL observer logs.
 * node scripts/summarize-cloud-network.mjs qa-artifacts/cloud/network.jsonl
 * Malformed input is an error; observed request failures remain in the output.
 */
import fs from 'node:fs';
import { summarizeNetwork } from './lib/network-diagnostics.mjs';
const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide one or more network JSONL files');
const reports = files.map((file) => {
  const entries = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { file, ...summarizeNetwork(entries) };
});
console.log(JSON.stringify(reports, null, 2));
