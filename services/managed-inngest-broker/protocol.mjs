import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const stripKey = key => key.replace(/^signkey-[\w]+-/, '');
export function keyHash(key) {
  const prefix = key.match(/^signkey-[\w]+-/)?.[0] ?? '';
  const raw = stripKey(key);
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('Expected a 256-bit hexadecimal signing key');
  return prefix + createHash('sha256').update(Buffer.from(raw, 'hex')).digest('hex');
}
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function sign(body, key, timestamp = Math.round(Date.now() / 1000)) {
  const encoded = typeof body === 'string' ? body : canonical(body);
  const signature = createHmac('sha256', stripKey(key)).update(encoded).update(String(timestamp)).digest('hex');
  return `t=${timestamp}&s=${signature}`;
}
export function verify(body, key, signature, now = Date.now()) {
  if (typeof signature !== 'string' || !/^t=\d{10}&s=[a-f0-9]{64}$/.test(signature)) return false;
  const p = new URLSearchParams(signature), ts = Number(p.get('t'));
  return Math.abs(now - ts * 1000) <= 300_000 && equal(sign(body, key, ts), signature);
}
export function demand(condition, status = 403, code = 'denied') {
  if (!condition) throw Object.assign(new Error(code), { status, code });
}
export function exactKeys(value, required, optional = []) {
  demand(value && !Array.isArray(value) && typeof value === 'object', 400, 'invalid_object');
  demand(required.every(k => Object.hasOwn(value, k)), 400, 'missing_field');
  demand(Object.keys(value).every(k => required.includes(k) || optional.includes(k)), 400, 'unexpected_field');
}
export function fixture(data) {
  exactKeys(data, ['fixtureId', 'scenario', 'waitSeconds']);
  demand(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.fixtureId), 400, 'invalid_fixture');
  demand(['checkpoint', 'duplicate', 'uncertain'].includes(data.scenario), 400, 'invalid_scenario');
  demand(Number.isInteger(data.waitSeconds) && data.waitSeconds >= 0 && data.waitSeconds <= 360, 400, 'invalid_wait');
}
export function steps(items) {
  demand(Array.isArray(items) && items.length > 0 && items.length <= 8, 400, 'invalid_steps');
  demand(Buffer.byteLength(JSON.stringify(items)) <= 32_768, 413, 'steps_too_large');
  for (const step of items) {
    demand(step && ['StepRun', 'StepPlanned', 'StepError', 'StepFailed', 'Sleep', 'RunComplete'].includes(step.op), 403, 'opcode_denied');
    demand(typeof step.id === 'string' && step.id.length <= 160, 400, 'invalid_step_id');
    if (step.op === 'Sleep') {
      const match = /^(\d+)(ms|s|m)$/.exec(step.name ?? '');
      demand(match && Number(match[1]) * ({ ms: .001, s: 1, m: 60 }[match[2]]) <= 360, 403, 'sleep_limit');
    }
    demand(!step.opts?.url && !step.opts?.function_id && !step.opts?.event, 403, 'step_target_denied');
  }
}
