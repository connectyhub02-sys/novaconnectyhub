import {readFile} from 'node:fs/promises';
import {telemetryGateway,telemetryRestSink} from './telemetry-gateway.mjs';
if(!process.env.MANAGED_TELEMETRY_KEY_FILE||!process.env.MANAGED_DATABASE_KEY_FILE)throw Error('Private key files required');
const key=(await readFile(process.env.MANAGED_TELEMETRY_KEY_FILE,'utf8')).trim();
const dbKey=(await readFile(process.env.MANAGED_DATABASE_KEY_FILE,'utf8')).trim();
const server=telemetryGateway({key,persist:telemetryRestSink({root:process.env.MANAGED_DATABASE_REST_URL,key:dbKey})});
server.listen(Number(process.env.PORT??3082),process.env.MANAGED_GATEWAY_BIND??'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
