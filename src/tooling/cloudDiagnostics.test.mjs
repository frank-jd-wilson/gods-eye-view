import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  arrivalRepeatCount,
  summarizeArrival,
} from '../../scripts/lib/arrival-timings.mjs';
import {
  createNetworkLog,
  networkEvent,
  summarizeNetwork,
} from '../../scripts/lib/network-diagnostics.mjs';

test('timing statistics include slow failures and use nearest-rank P95', () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 900, 1000].map(
    (elapsedMs) => ({ elapsedMs, passed: elapsedMs < 500 }),
  );
  assert.deepEqual(summarizeArrival(samples), {
    samples: 10,
    measured: 10,
    passed: 8,
    failed: 2,
    meanMs: 226,
    medianMs: 55,
    p95Ms: 1000,
    maxMs: 1000,
  });
  assert.equal(samples[0].elapsedMs, 10);
});

test('missing measurements remain failures and empty statistics are null', () => {
  assert.deepEqual(summarizeArrival([{ error: 'missing fixture' }]), {
    samples: 1,
    measured: 0,
    passed: 0,
    failed: 1,
    meanMs: null,
    medianMs: null,
    p95Ms: null,
    maxMs: null,
  });
  assert.equal(
    summarizeArrival([{ elapsedMs: 88, passed: true }]).medianMs,
    88,
  );
  assert.equal(summarizeArrival([]).samples, 0);
});

test('repeat counts reject zero, partial numbers and excessive runs', () => {
  for (const value of ['0', '-1', '10x', '1.5', '101', '--url'])
    assert.throws(() => arrivalRepeatCount(value));
  assert.equal(arrivalRepeatCount('10'), 10);
  assert.equal(arrivalRepeatCount('1'), 1);
});

test('network records exclude userinfo, paths, query, headers and arbitrary error text', () => {
  const entry = networkEvent({
    event: 'requestfailed',
    url: 'https://user:example-password@provider.example/private/example-token?key=example-key#secret',
    headers: { authorization: 'example-credential' },
    error: 'failed https://provider.example/?key=example-key',
  });
  assert.deepEqual(entry, {
    event: 'requestfailed',
    domain: 'provider.example',
    status: null,
  });
  assert.equal(JSON.stringify(entry).includes('example-key'), false);
  assert.equal(
    networkEvent({
      event: 'requestfailed',
      url: 'https://provider.example',
      error: 'net::ERR_ABORTED',
    }).error,
    'net::ERR_ABORTED',
  );
});

test('summaries keep HTTP failures, TLS failures and cancellations distinct', () => {
  const summary = summarizeNetwork([
    { event: 'response', domain: 'provider.example', status: 200 },
    { event: 'response', domain: 'provider.example', status: 403 },
    {
      event: 'requestfailed',
      domain: 'provider.example',
      status: null,
      error: 'net::ERR_CERT_AUTHORITY_INVALID',
    },
    {
      event: 'requestfailed',
      domain: 'localhost',
      status: null,
      error: 'net::ERR_ABORTED',
    },
  ]);
  assert.equal(summary.failures.length, 3);
  assert.equal(summary.failures[1].status, null);
  assert.equal(summary.failures[2].error, 'net::ERR_ABORTED');
});

test('log creation preserves previous evidence and writes private files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-network-log-'));
  try {
    const filename = path.join(root, 'network.jsonl');
    const log = createNetworkLog(filename);
    log.write({ event: 'response', domain: 'provider.example', status: 200 });
    log.close();
    assert.throws(() => createNetworkLog(filename), { code: 'EEXIST' });
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).status, 200);
    if (process.platform !== 'win32')
      assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('server observer preserves fetch response and rejection without logging bodies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-server-observer-'));
  try {
    const filename = path.join(root, 'server.jsonl');
    const preload = fileURLToPath(
      new URL('../../scripts/observe-server-network.mjs', import.meta.url),
    );
    const code = `
      const response = await fetch(new Request('data:text/plain,example-private-body'));
      if (response.status !== 200 || await response.text() !== 'example-private-body') process.exit(3);
      try { await fetch('not-a-url'); process.exit(4); }
      catch (error) { if (!(error instanceof TypeError)) process.exit(5); }
    `;
    execFileSync(
      process.execPath,
      ['--import', preload, '--input-type=module', '-e', code],
      { env: { ...process.env, GEV_NETWORK_LOG: filename }, stdio: 'pipe' },
    );
    const text = fs.readFileSync(filename, 'utf8');
    const events = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(events.length, 2);
    assert.equal(events[0].status, 200);
    assert.equal(events[1].event, 'requestfailed');
    assert.equal(events[1].status, null);
    assert.equal(text.includes('example-private-body'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
