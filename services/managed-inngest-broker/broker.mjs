import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { canonical, demand, equal, exactKeys, fixture, keyHash, sign, steps, stripKey, verify } from './protocol.mjs';

const idPattern = /^[a-zA-Z0-9_-]{1,160}$/;
const uuidPattern = /^[a-f0-9-]{36}$/i;
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

export class Ledger {
  constructor(path, value) { this.path = path; this.value = value; this.queue = Promise.resolve(); }
  static async open(path) {
    let value;
    try { value = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; value = { version: 1, events: {}, runs: {}, registrations: 0 }; }
    demand(value.version === 1 && value.events && value.runs, 500, 'invalid_ledger');
    return new Ledger(path, value);
  }
  change(action) {
    const next = this.queue.then(async () => {
      const result = action(this.value);
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      await writeFile(`${this.path}.tmp`, JSON.stringify(this.value), { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
      return result;
    });
    this.queue = next.catch(() => {});
    return next;
  }
}

export class Broker {
  constructor(config, ledger, send = fetch) {
    this.c = config; this.ledger = ledger; this.send = send; this.requests = [];
    for (const key of ['upstreamBase', 'callbackUrl', 'handlerUrl']) {
      const u = new URL(config[key]);
      demand(u.protocol === 'http:' && !u.username && !u.password && !u.hash && !u.search, 500, 'invalid_fixed_endpoint');
      demand(u.hostname === '127.0.0.1' || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(u.hostname), 500, 'endpoint_not_private');
    }
    demand(config.appId === 'betel-ai-rehearsal' && config.eventName === 'betel/rehearsal.analysis.requested', 500, 'invalid_project_scope');
    demand(config.functionId === 'betel-ai-rehearsal-synthetic-analysis', 500, 'invalid_function_scope');
    demand(config.functions?.length === 1 && config.functions[0].id === config.functionId, 500, 'invalid_trusted_manifest');
    const fn = config.functions[0];
    demand(canonical(fn.triggers) === canonical([{ event: config.eventName }]) && fn.concurrency === 1 && fn.idempotency === 'event.data.fixtureId', 500, 'unsafe_trusted_trigger');
    demand(Object.keys(fn.steps ?? {}).join(',') === 'step' && fn.steps.step.runtime?.type === 'http' && fn.steps.step.runtime?.url === `${config.callbackUrl}?fnId=${config.functionId}&stepId=step` && fn.steps.step.retries?.attempts === 0, 500, 'unsafe_trusted_handler');
    demand(config.projectSigningKey !== config.upstreamSigningKey && config.projectEventKey !== config.upstreamEventKey, 500, 'shared_key_forbidden');
    this.projectAuth = `Bearer ${keyHash(config.projectSigningKey)}`;
    this.upstreamAuth = `Bearer ${keyHash(config.upstreamSigningKey)}`;
  }
  limit() {
    const cutoff = Date.now() - 60_000;
    this.requests = this.requests.filter(t => t > cutoff);
    demand(this.requests.length < 120, 429, 'rate_limit');
    this.requests.push(Date.now());
  }
  async fixed(base, path, method, body, headers = {}) {
    const response = await this.send(new URL(path, base), {
      method, headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : canonical(body) }),
      redirect: 'manual', signal: AbortSignal.timeout(30_000),
    });
    demand(response.status < 300 || response.status >= 400, 502, 'redirect_refused');
    demand(Number(response.headers.get('content-length') || 0) <= 262_144, 502, 'upstream_too_large');
    const reader = response.body?.getReader(); let size = 0; const chunks = [];
    if (reader) for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 262_144) { await reader.cancel(); demand(false, 502, 'upstream_too_large'); }
      chunks.push(Buffer.from(value));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    for (const secret of [this.c.upstreamSigningKey, stripKey(this.c.upstreamSigningKey), this.c.upstreamEventKey, this.upstreamAuth.slice(7), stripKey(this.upstreamAuth.slice(7))]) demand(!text.includes(secret), 502, 'upstream_secret_refused');
    return { status: response.status, text, headers: response.headers };
  }
  async upstream(path, method, body) {
    return this.fixed(this.c.upstreamBase, path, method, body, { authorization: this.upstreamAuth });
  }
  async handle({ method, rawUrl, headers = {}, body }) {
    this.limit();
    demand(rawUrl.startsWith('/') && !rawUrl.startsWith('//') && !/[\\%]/.test(rawUrl), 400, 'invalid_path');
    const url = new URL(rawUrl, 'http://broker');
    const callback = new URL(this.c.callbackUrl);
    if (url.pathname === callback.pathname) return this.callback(method, url, headers, body);
    demand(!url.search, 403, 'query_denied');
    if (url.pathname === '/health' && method === 'GET') return { status: 200, body: { scope: this.c.appId, live: this.c.live === true } };
    demand(this.c.live === true, 503, 'integration_not_enabled');
    if (method === 'POST' && url.pathname.startsWith('/e/')) return this.event(url.pathname, body);
    demand(equal(headers.authorization, this.projectAuth), 401, 'project_auth_required');
    if (method === 'POST' && url.pathname === '/fn/register') return this.register(body);
    const read = /^\/v0\/runs\/([a-zA-Z0-9_-]{1,160})\/(actions|batch)$/.exec(url.pathname);
    if (method === 'GET' && read) {
      demand(Object.hasOwn(this.ledger.value.runs, read[1]), 403, 'run_not_owned');
      return this.upstream(url.pathname, 'GET');
    }
    const checkpoint = /^\/v1\/checkpoint\/([a-zA-Z0-9_-]{1,160})\/async$/.exec(url.pathname);
    if (method === 'POST' && checkpoint) return this.checkpoint(checkpoint[1], url.pathname, body);
    demand(false, 403, 'route_denied');
  }
  async event(path, body) {
    demand(equal(path, `/e/${this.c.projectEventKey}`), 401, 'event_key_required');
    const list = Array.isArray(body) ? body : [body];
    demand(list.length === 1, 400, 'single_event_required');
    const event = list[0]; exactKeys(event, ['name', 'data'], ['id', 'ts', 'v']);
    demand(event.name === this.c.eventName, 403, 'event_not_allowed'); fixture(event.data);
    demand(event.ts === undefined || (Number.isSafeInteger(event.ts) && Math.abs(Date.now() - event.ts) < 60_000), 400, 'event_time_denied');
    demand(event.id === undefined || event.id === event.data.fixtureId, 400, 'event_id_denied');
    demand(event.v === undefined || event.v === '1', 400, 'event_version_denied');
    const key = event.data.fixtureId, hash = digest(event.data);
    const previous = await this.ledger.change(state => {
      if (Object.hasOwn(state.events, key)) { demand(state.events[key].hash === hash, 409, 'fixture_conflict'); return state.events[key]; }
      demand(Object.keys(state.events).length < 20, 429, 'rehearsal_event_cap');
      state.events[key] = { hash, state: 'uncertain', createdAt: Date.now() }; return null;
    });
    if (previous) {
      demand(previous.state === 'accepted', 409, 'event_delivery_uncertain');
      return { status: 200, body: previous.reply };
    }
    const response = await this.upstream(`/e/${this.c.upstreamEventKey}`, 'POST', [{ name: this.c.eventName, data: event.data, id: key }]);
    demand(response.status === 200, 502, 'event_delivery_uncertain');
    const reply = JSON.parse(response.text);
    demand(Array.isArray(reply.ids) && reply.ids.length === 1 && idPattern.test(reply.ids[0]), 502, 'invalid_event_receipt');
    await this.ledger.change(state => { Object.assign(state.events[key], { state: 'accepted', reply: { ids: reply.ids, status: 200 } }); });
    return { status: 200, body: { ids: reply.ids, status: 200 } };
  }
  async register(body) {
    demand(this.c.allowRegistration === true, 403, 'registration_disabled');
    exactKeys(body, ['url', 'deployType', 'framework', 'appName', 'functions', 'sdk', 'v'], ['capabilities', 'appVersion']);
    demand(body.appName === this.c.appId && body.url === this.c.callbackUrl, 403, 'registration_scope_denied');
    demand(body.deployType === 'ping' && body.v === '0.1' && body.sdk === 'js:v4.6.0', 400, 'registration_protocol_denied');
    demand(canonical(body.functions) === canonical(this.c.functions), 403, 'function_manifest_denied');
    demand(this.c.functions.length === 1 && this.c.functions[0].id === this.c.functionId, 500, 'invalid_trusted_manifest');
    const trusted = { url: this.c.callbackUrl, deployType: 'ping', framework: body.framework, appName: this.c.appId, functions: this.c.functions, sdk: 'js:v4.6.0', v: '0.1', capabilities: {} };
    demand(this.ledger.value.registrations < 4, 429, 'registration_cap');
    await this.ledger.change(s => { s.registrations += 1; });
    return this.upstream('/fn/register', 'POST', trusted);
  }
  async callback(method, url, headers, body) {
    demand(this.c.live === true, 503, 'integration_not_enabled');
    demand(method === 'POST', 403, 'callback_method_denied');
    demand([...url.searchParams.keys()].every(k => ['fnId', 'stepId'].includes(k)) && url.searchParams.getAll('fnId').length === 1 && url.searchParams.getAll('stepId').length <= 1, 403, 'callback_query_denied');
    demand(url.searchParams.get('fnId') === this.c.functionId, 403, 'callback_function_denied');
    demand(!url.searchParams.has('stepId') || idPattern.test(url.searchParams.get('stepId')), 400, 'invalid_step');
    demand(verify(body, this.c.upstreamSigningKey, headers['x-inngest-signature']), 401, 'engine_signature_required');
    demand(body?.event?.name === this.c.eventName, 403, 'callback_event_denied'); fixture(body.event.data);
    const accepted = this.ledger.value.events[body.event.data.fixtureId];
    // A callback can race the event receipt. The durable pre-send record binds it to this fixture.
    demand(accepted && accepted.hash === digest(body.event.data), 403, 'unsubmitted_fixture');
    demand(!body.events || body.events.every(e => e.name === this.c.eventName && e.data?.fixtureId === body.event.data.fixtureId), 403, 'callback_batch_denied');
    demand(idPattern.test(body.ctx?.run_id ?? '') && uuidPattern.test(body.ctx?.fn_id ?? '') && typeof body.ctx?.qi_id === 'string', 400, 'invalid_run_context');
    const run = body.ctx.run_id, requestId = headers['x-request-id'], generation = headers['x-inngest-generation-id'];
    demand(idPattern.test(requestId ?? ''), 400, 'invalid_request_id');
    await this.ledger.change(state => {
      const previous = state.runs[run];
      demand(!previous || (previous.fixtureId === body.event.data.fixtureId && previous.fnId === body.ctx.fn_id), 403, 'run_collision');
      const value = previous || { fixtureId: body.event.data.fixtureId, fnId: body.ctx.fn_id, dispatches: {} };
      demand(Object.keys(value.dispatches).length < 40 || value.dispatches[requestId], 429, 'dispatch_cap');
      value.dispatches[requestId] = { queue: body.ctx.qi_id, generation: generation === undefined ? null : Number(generation) };
      state.runs[run] = value;
    });
    const forwarding = { 'x-inngest-signature': sign(body, this.c.projectSigningKey), 'x-request-id': requestId };
    for (const key of ['x-inngest-generation-id', 'x-inngest-req-version', 'x-inngest-job-id']) if (headers[key]) forwarding[key] = headers[key];
    const target = new URL(this.c.handlerUrl); target.search = url.search;
    const response = await this.fixed(target.origin, target.pathname + target.search, 'POST', body, forwarding);
    demand(verify(response.text, this.c.projectSigningKey, response.headers.get('x-inngest-signature')), 502, 'handler_signature_required');
    if (response.status === 206) steps(JSON.parse(response.text));
    const replyHeaders = { 'x-inngest-signature': sign(response.text, this.c.upstreamSigningKey), 'x-inngest-req-version': response.headers.get('x-inngest-req-version') ?? '1' };
    for (const key of ['x-inngest-no-retry', 'x-inngest-retry-after']) if (response.headers.get(key)) replyHeaders[key] = response.headers.get(key);
    for (const key of ['x-inngest-sdk', 'x-inngest-sdk-handled']) {
      const value = response.headers.get(key);
      if (value) { demand(/^[a-zA-Z0-9:._-]{1,60}$/.test(value), 502, 'invalid_sdk_header'); replyHeaders[key] = value; }
    }
    return { status: response.status, text: response.text, headers: replyHeaders };
  }
  async checkpoint(run, path, body) {
    demand(Object.hasOwn(this.ledger.value.runs, run), 403, 'run_not_owned');
    const owned = this.ledger.value.runs[run];
    exactKeys(body, ['run_id', 'fn_id', 'qi_id', 'request_id', 'steps', 'ts'], ['generation_id', 'request_started_at']);
    const dispatch = Object.hasOwn(owned.dispatches, body.request_id) ? owned.dispatches[body.request_id] : undefined;
    demand(body.run_id === run && body.fn_id === owned.fnId && dispatch && body.qi_id === dispatch.queue, 403, 'checkpoint_ownership_denied');
    demand((body.generation_id ?? null) === dispatch.generation, 403, 'checkpoint_generation_denied');
    demand(Number.isSafeInteger(body.ts) && Math.abs(Date.now() - body.ts) < 300_000, 400, 'checkpoint_time_denied');
    steps(body.steps);
    return this.upstream(path, 'POST', body);
  }
}
