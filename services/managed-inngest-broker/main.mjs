import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Broker, Ledger } from './broker.mjs';

const config = JSON.parse(await readFile(process.env.BROKER_CONFIG, 'utf8'));
const ledger = await Ledger.open(process.env.BROKER_LEDGER);
const broker = new Broker(config, ledger);
const handle = async (request, response) => {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', 'application/json');
  try {
    if (request.headers['content-encoding']) throw Object.assign(new Error(), { status: 415, code: 'encoding_denied' });
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65_536) throw Object.assign(new Error(), { status: 413, code: 'body_too_large' });
      chunks.push(chunk);
    }
    let body;
    if (size) {
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw Object.assign(new Error(), { status: 400, code: 'invalid_json' }); }
    }
    const result = await broker.handle({ method: request.method, rawUrl: request.url, headers: request.headers, body });
    const headers = result.headers instanceof Headers ? Object.fromEntries(result.headers) : result.headers ?? {};
    for (const name of ['x-inngest-signature', 'x-inngest-req-version', 'x-inngest-no-retry', 'x-inngest-retry-after', 'x-inngest-sdk', 'x-inngest-sdk-handled']) if (headers[name]) response.setHeader(name, headers[name]);
    response.writeHead(result.status);
    response.end(result.text ?? JSON.stringify(result.body));
  } catch (error) {
    // Static error codes only: never log URLs, credentials, or request payloads.
    console.error(JSON.stringify({ status: error.status ?? 502, code: error.code ?? 'upstream_unavailable' }));
    response.writeHead(error.status ?? 502);
    response.end(JSON.stringify({ error: error.code ?? 'upstream_unavailable' }));
  }
};
const servers = (process.env.HOST ?? '127.0.0.1').split(',').map(host => {
  if (!['127.0.0.1', '172.18.0.1', '172.21.0.1'].includes(host)) throw new Error('Listener not approved');
  const server = http.createServer(handle);
  server.requestTimeout = 35_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 40;
  server.maxConnections = 20;
  server.listen(Number(process.env.PORT ?? 28110), host);
  return server;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  let remaining = servers.length;
  for (const server of servers) server.close(() => { if (--remaining === 0) process.exit(0); });
});
