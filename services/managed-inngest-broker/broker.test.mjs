import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Broker, Ledger } from './broker.mjs';
import { keyHash, sign, verify, steps } from './protocol.mjs';

const projectKey = 'signkey-prod-' + 'a1'.repeat(32), engineKey = 'signkey-prod-' + 'b2'.repeat(32);
const fixtureId = '11111111-1111-4111-8111-111111111111';
const config = {
  live: true, allowRegistration: true, appId: 'betel-ai-rehearsal',
  eventName: 'betel/rehearsal.analysis.requested', functionId: 'betel-ai-rehearsal-synthetic-analysis',
  projectSigningKey: projectKey, upstreamSigningKey: engineKey,
  projectEventKey: 'project-test-only', upstreamEventKey: 'engine-test-only',
  upstreamBase: 'http://127.0.0.1:8288', callbackUrl: 'http://172.18.0.1:28110/api/inngest/rehearsal',
  handlerUrl: 'http://172.21.0.2:28102/api/inngest/rehearsal',
  functions: [{ id: 'betel-ai-rehearsal-synthetic-analysis', triggers: [{ event: 'betel/rehearsal.analysis.requested' }], concurrency: 1, idempotency: 'event.data.fixtureId', steps: { step: { runtime: { type: 'http', url: 'http://172.18.0.1:28110/api/inngest/rehearsal?fnId=betel-ai-rehearsal-synthetic-analysis&stepId=step' }, retries: { attempts: 0 } } } }],
};
const fixtureData = () => ({ fixtureId, scenario: 'checkpoint', waitSeconds: 1 });
const event = () => ({ name: config.eventName, data: fixtureData(), id: fixtureId });
const authorization = `Bearer ${keyHash(projectKey)}`;
const callbackBody = () => ({ event: event(), events: [event()], steps: {}, ctx: { run_id: '01BETELRUN', fn_id: '11111111-1111-1111-1111-111111111111', qi_id: 'queue-betel' } });
const callbackHeaders = body => ({ 'x-inngest-signature': sign(body, engineKey), 'x-request-id': 'request-betel', 'x-inngest-generation-id': '1' });
const checkpoint = () => ({ run_id: '01BETELRUN', fn_id: '11111111-1111-1111-1111-111111111111', qi_id: 'queue-betel', request_id: 'request-betel', generation_id: 1, steps: [{ op: 'StepRun', id: 'synthetic', data: { ok: true } }], ts: Date.now() });
const register = () => ({ url: config.callbackUrl, deployType: 'ping', framework: 'nextjs', appName: config.appId, functions: structuredClone(config.functions), sdk: 'js:v4.6.0', v: '0.1', capabilities: { trust_probe: 'v1' } });

async function setup(t, responder) {
  const folder = await mkdtemp(join(tmpdir(), 'betel-broker-test-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const ledger = await Ledger.open(join(folder, 'ledger.json')), calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (responder) return responder(url, options);
    if (url.port === '28102') {
      const text = JSON.stringify({ synthetic: true });
      assert.ok(verify(JSON.parse(options.body), projectKey, options.headers['x-inngest-signature']));
      return new Response(text, { headers: { 'x-inngest-signature': sign(text, projectKey) } });
    }
    assert.equal(options.headers.authorization, `Bearer ${keyHash(engineKey)}`);
    return new Response(JSON.stringify(url.pathname.startsWith('/e/') ? { ids: ['01EVENTBETEL'] } : { ok: true }));
  };
  return { broker: new Broker(config, ledger, fetcher), ledger, calls, fetcher };
}
const rejected = (promise, code) => assert.rejects(promise, e => e.code === code);
test('prototype property names never authorize an unowned run', async t => {
  const { broker, calls } = await setup(t);
  for (const run of ['__proto__', 'constructor', 'toString']) {
    await rejected(broker.handle({ method: 'GET', rawUrl: `/v0/runs/${run}/actions`, headers: { authorization } }), 'run_not_owned');
    await rejected(broker.handle({ method: 'POST', rawUrl: `/v1/checkpoint/${run}/async`, headers: { authorization }, body: checkpoint() }), 'run_not_owned');
  }
  assert.equal(calls.length, 0);
});
async function ownRun(broker) {
  await broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() });
  const body = callbackBody();
  return broker.handle({ method: 'POST', rawUrl: '/api/inngest/rehearsal?fnId=' + config.functionId + '&stepId=step', headers: callbackHeaders(body), body });
}

test('HMAC canonicalizes requests and preserves raw response strings, rejects expired/tampered signatures', () => {
  const sig = sign({ z: 1, a: 2 }, projectKey);
  assert.ok(verify({ a: 2, z: 1 }, projectKey, sig));
  assert.ok(!verify({ a: 3, z: 1 }, projectKey, sig));
  assert.ok(!verify({}, projectKey, sign({}, projectKey, Math.round(Date.now() / 1000) - 301)));
  assert.notEqual(sign('{"z":1,"a":2}', projectKey), sign({ z: 1, a: 2 }, projectKey));
  assert.notEqual(keyHash(projectKey), keyHash(engineKey));
});
test('event uses only upstream key internally and persists idempotent receipt over restart', async t => {
  const { broker, ledger, calls, fetcher } = await setup(t);
  const first = await broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: [event()] });
  const reopened = new Broker(config, await Ledger.open(ledger.path), fetcher);
  assert.deepEqual(await reopened.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() }), first);
  assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/e/engine-test-only'));
});
test('uncertain event delivery is never automatically sent a second time', async t => {
  const { broker, calls } = await setup(t, () => { throw new Error('timeout'); });
  await assert.rejects(broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() }));
  await rejected(broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() }), 'event_delivery_uncertain');
  assert.equal(calls.length, 1);
});
test('same fixture cannot be changed for a second event', async t => {
  const { broker } = await setup(t);
  await broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() });
  const changed = event(); changed.data.scenario = 'duplicate';
  await rejected(broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: changed }), 'fixture_conflict');
});
for (const [label, mutate, code] of [
  ['other event', e => { e.name = 'connectyhub/payment'; }, 'event_not_allowed'],
  ['URL in data', e => { e.data.url = 'http://169.254.169.254'; }, 'unexpected_field'],
  ['business identifier', e => { e.data.leadId = 'private'; }, 'unexpected_field'],
  ['long sleep', e => { e.data.waitSeconds = 361; }, 'invalid_wait'],
  ['scheduled event', e => { e.ts = Date.now() + 120000; }, 'event_time_denied'],
]) test(`rejects ${label} before any upstream request`, async t => {
  const { broker, calls } = await setup(t); const value = event(); mutate(value);
  await rejected(broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: value }), code); assert.equal(calls.length, 0);
});
test('registration enforces trusted manifest, app and callback', async t => {
  const { broker, calls } = await setup(t);
  const valid = register(); await broker.handle({ method: 'POST', rawUrl: '/fn/register', headers: { authorization }, body: valid });
  assert.deepEqual(JSON.parse(calls[0].body).capabilities, {});
  for (const mutate of [x => { x.appName = 'connectyhub'; }, x => { x.url = 'http://169.254.169.254'; }, x => { x.functions[0].triggers = [{ cron: '* * * * *' }]; }]) {
    const invalid = register(); mutate(invalid);
    await assert.rejects(broker.handle({ method: 'POST', rawUrl: '/fn/register', headers: { authorization }, body: invalid }));
  }
  assert.equal(calls.length, 1);
});
test('verified engine callback binds run/function/dispatch and re-signs both directions', async t => {
  const { broker, ledger } = await setup(t); const result = await ownRun(broker);
  assert.ok(verify(result.text, engineKey, result.headers['x-inngest-signature']));
  assert.equal(ledger.value.runs['01BETELRUN'].fixtureId, fixtureId);
  assert.equal(ledger.value.runs['01BETELRUN'].dispatches['request-betel'].queue, 'queue-betel');
});
test('project key cannot impersonate engine callback or claim another function', async t => {
  const { broker, calls } = await setup(t); const body = callbackBody();
  await rejected(broker.handle({ method: 'POST', rawUrl: '/api/inngest/rehearsal?fnId=' + config.functionId, headers: { ...callbackHeaders(body), 'x-inngest-signature': sign(body, projectKey) }, body }), 'engine_signature_required');
  await rejected(broker.handle({ method: 'POST', rawUrl: '/api/inngest/rehearsal?fnId=connectyhub', headers: callbackHeaders(body), body }), 'callback_function_denied');
  assert.equal(calls.length, 0);
});
test('unowned runs, foreign checkpoints and arbitrary endpoints are rejected', async t => {
  const { broker, calls } = await setup(t);
  for (const rawUrl of ['/v0/runs/OTHER/actions', '/v0/runs/OTHER/batch', '/v1/checkpoint/OTHER/async', '/v1/checkpoint', '/v0/gql', '/v1/realtime/publish/tee', '/apps', '/v1/runs/OTHER/cancel']) {
    await assert.rejects(broker.handle({ method: rawUrl.endsWith('actions') || rawUrl.endsWith('batch') ? 'GET' : 'POST', rawUrl, headers: { authorization }, body: checkpoint() }));
  }
  assert.equal(calls.length, 0);
  await ownRun(broker);
  await broker.handle({ method: 'POST', rawUrl: '/v1/checkpoint/01BETELRUN/async', headers: { authorization }, body: checkpoint() });
  assert.ok(calls.at(-1).url.endsWith('/v1/checkpoint/01BETELRUN/async'));
  for (const field of ['run_id', 'fn_id', 'qi_id', 'request_id', 'generation_id']) {
    const invalid = checkpoint(); invalid[field] = field === 'generation_id' ? 2 : 'OTHER';
    await assert.rejects(broker.handle({ method: 'POST', rawUrl: '/v1/checkpoint/01BETELRUN/async', headers: { authorization }, body: invalid }));
  }
});
test('checkpoint cannot emit events, invoke other functions, or schedule long sleeps', () => {
  for (const op of ['InvokeFunction', 'WaitForEvent', 'Step', 'SendEvent']) assert.throws(() => steps([{ op, id: 'x' }]));
  assert.throws(() => steps([{ op: 'Sleep', id: 'x', name: '7m' }]));
  assert.throws(() => steps([{ op: 'StepRun', id: 'x', opts: { url: 'http://evil' } }]));
  steps([{ op: 'Sleep', id: 'x', name: '6m' }]);
});
test('redirects and secret-bearing upstream responses fail closed', async t => {
  const redirect = await setup(t, () => new Response('', { status: 302, headers: { location: 'http://169.254.169.254' } }));
  await rejected(redirect.broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() }), 'redirect_refused');
  const secret = await setup(t, () => new Response(config.upstreamSigningKey));
  await rejected(secret.broker.handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() }), 'upstream_secret_refused');
});
test('live switch, key gate, encoded paths and registration switch fail closed', async t => {
  const { broker, ledger, fetcher, calls } = await setup(t);
  await rejected(new Broker({ ...config, live: false }, ledger, fetcher).handle({ method: 'POST', rawUrl: '/e/project-test-only', body: event() }), 'integration_not_enabled');
  await rejected(broker.handle({ method: 'POST', rawUrl: '/e/wrong', body: event() }), 'event_key_required');
  await rejected(broker.handle({ method: 'GET', rawUrl: '/v0/runs/owned/actions', headers: { authorization: `Bearer ${keyHash(engineKey)}` } }), 'project_auth_required');
  await rejected(broker.handle({ method: 'GET', rawUrl: '/v0/%2e%2e/gql', headers: { authorization } }), 'invalid_path');
  await rejected(new Broker({ ...config, allowRegistration: false }, ledger, fetcher).handle({ method: 'POST', rawUrl: '/fn/register', headers: { authorization }, body: register() }), 'registration_disabled');
  assert.equal(calls.length, 0);
});
