import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyHash, sign, verify } from './protocol.mjs';

test('real HTTP process enforces scope, translates callbacks and gates checkpoints', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'betel-broker-http-'));
  const project = 'signkey-prod-' + 'a1'.repeat(32), engine = 'signkey-prod-' + 'b2'.repeat(32);
  const engineCalls = [];
  const listen = async handler => {
    const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return { server, port: server.address().port };
  };
  const upstream = await listen(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    engineCalls.push({ path: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks).toString() });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url.startsWith('/e/') ? { ids: ['01HTTPBETELEVENT'] } : { ok: true }));
  });
  const handler = await listen(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const data = JSON.parse(Buffer.concat(chunks).toString());
    assert.ok(verify(data, project, req.headers['x-inngest-signature']));
    const text = JSON.stringify({ synthetic: true, http: true });
    res.setHeader('x-inngest-sdk', 'inngest-js:v4.6.0');
    res.setHeader('x-inngest-sdk-handled', 'true');
    res.setHeader('x-inngest-signature', sign(text, project)); res.end(text);
  });
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const callback = `http://127.0.0.1:${port}/api/inngest/rehearsal`, fn = 'betel-ai-rehearsal-synthetic-analysis';
  const config = { live: true, allowRegistration: false, appId: 'betel-ai-rehearsal', eventName: 'betel/rehearsal.analysis.requested', functionId: fn, projectSigningKey: project, upstreamSigningKey: engine, projectEventKey: 'http-project-key', upstreamEventKey: 'http-engine-key', upstreamBase: `http://127.0.0.1:${upstream.port}`, callbackUrl: callback, handlerUrl: `http://127.0.0.1:${handler.port}/api/inngest/rehearsal`, functions: [{ id: fn, triggers: [{ event: 'betel/rehearsal.analysis.requested' }], concurrency: 1, idempotency: 'event.data.fixtureId', steps: { step: { runtime: { type: 'http', url: `${callback}?fnId=${fn}&stepId=step` }, retries: { attempts: 0 } } } }] };
  const configPath = join(folder, 'config.json'); await writeFile(configPath, JSON.stringify(config));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./main.mjs', import.meta.url))], { env: { ...process.env, BROKER_CONFIG: configPath, BROKER_LEDGER: join(folder, 'ledger.json'), HOST: '127.0.0.1', PORT: String(port) }, stdio: 'ignore' });
  t.after(async () => { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } await rm(folder, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try { healthy = (await fetch(base + '/health')).ok; if (healthy) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(healthy);
  const request = (path, body, headers = {}) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const authorization = `Bearer ${keyHash(project)}`;
  assert.equal((await request('/v0/gql', {}, { authorization })).status, 403);
  assert.equal((await request('/v0/runs/FOREIGN/actions', undefined, { authorization })).status, 403);
  assert.equal((await request('/fn/register', {}, { authorization })).status, 403);
  assert.equal(engineCalls.length, 0);
  const event = { name: config.eventName, data: { fixtureId: '22222222-2222-4222-8222-222222222222', scenario: 'checkpoint', waitSeconds: 0 } };
  assert.equal((await request('/e/wrong', event)).status, 401);
  assert.equal((await request('/e/http-project-key', event)).status, 200);
  assert.equal(engineCalls.length, 1);
  assert.equal(engineCalls[0].auth, `Bearer ${keyHash(engine)}`);
  const body = { event, steps: {}, ctx: { run_id: '01HTTPRUN', fn_id: '22222222-2222-2222-2222-222222222222', qi_id: 'http-queue' } };
  const response = await request(`/api/inngest/rehearsal?fnId=${fn}&stepId=step`, body, { 'x-inngest-signature': sign(body, engine), 'x-request-id': 'http-request', 'x-inngest-generation-id': '0' });
  const text = await response.text(); assert.equal(response.status, 200); assert.ok(verify(text, engine, response.headers.get('x-inngest-signature')));
  assert.equal(response.headers.get('x-inngest-sdk'), 'inngest-js:v4.6.0');
  assert.equal(response.headers.get('x-inngest-sdk-handled'), 'true');
  assert.equal((await request('/v1/checkpoint/01HTTPRUN/async', { run_id: '01HTTPRUN', fn_id: body.ctx.fn_id, qi_id: 'http-queue', request_id: 'http-request', generation_id: 0, ts: Date.now(), steps: [{ op: 'RunComplete', id: 'complete', data: { synthetic: true } }] }, { authorization })).status, 200);
  assert.equal(engineCalls.length, 2);
  assert.equal((await request('/v0/runs/01HTTPRUN/actions', undefined, { authorization })).status, 200);
  assert.equal(engineCalls.length, 3);
});
