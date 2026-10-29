import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ionDigest } from './ionSettings.js';

test('pending reload stores only a digest, replacement differs from previous token', async () => {
  const a = await ionDigest('mock-token-before'),
    b = await ionDigest('mock-token-after');
  assert.notEqual(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.ok(!a.includes('mock-token'));
  assert.equal(b, await ionDigest('mock-token-after'));
});
test('provider API replaces, reads back and survives a fresh process without exposing values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-ion-store-'));
  const moduleUrl = new URL(
    '../server/standalone/key-setup.js',
    import.meta.url,
  ).href;
  const script = `
 import {keySetupEndpoint} from ${JSON.stringify(moduleUrl)};
 import {EventEmitter} from 'node:events';
 import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';
 const root=process.argv[1];let restarted=0;const routes=new Map();
 keySetupEndpoint({sourceRoot:root}).configureServer({middlewares:{use:(p,h)=>routes.set(p,h)},restart:async()=>{restarted++;}});
 const invoke=(route,body)=>{const req=new EventEmitter();req.method=body?'POST':'GET';req.socket={remoteAddress:'127.0.0.1'};req.headers={host:'127.0.0.1:4175',origin:'http://127.0.0.1:4175','content-type':'application/json'};let payload,code;const res={setHeader(){},set statusCode(c){code=c},end(data){payload=JSON.parse(data)}};routes.get(route)(req,res);if(body){req.emit('data',JSON.stringify(body));req.emit('end');}return {code,payload};};
 for(const value of ['mock-ion-first','mock-ion-replacement']) {const r=invoke('/api/setup/keys',{CESIUM_ION_TOKEN:value});assert.equal(r.code,200);assert.equal(r.payload.ok,true);assert.equal(r.payload.restarting,true);assert.equal(JSON.stringify(r.payload).includes(value),false);const file=path.join(root,'.env');assert.equal(parseEnv(fs.readFileSync(file,'utf8')).CESIUM_ION_TOKEN,value);assert.equal(process.env.CESIUM_ION_TOKEN,value);assert.equal(invoke('/api/setup/status').payload.keys.find(k=>k.id==='cesium-ion').managed,'file');}
 await new Promise(r=>setTimeout(r,300));assert.equal(restarted,2);
 `;
  const env = { PATH: process.env.PATH, TMPDIR: os.tmpdir() };
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script, root],
      { env, stdio: 'pipe' },
    );
    const reload = `import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import {loadEnv} from 'vite';const root=process.argv[1];const values=loadEnv('development',root,'');assert.equal(values.CESIUM_ION_TOKEN,'mock-ion-replacement');`;
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', reload, root],
      { env, stdio: 'pipe' },
    );
    assert.equal(fs.statSync(path.join(root, '.env')).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
