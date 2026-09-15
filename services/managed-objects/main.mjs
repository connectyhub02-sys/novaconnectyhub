import {readFile} from 'node:fs/promises';
import {diskStore} from './disk-store.mjs';
import {objectServer} from './server.mjs';
if(!process.env.MANAGED_OBJECT_ROOT||!process.env.MANAGED_OBJECT_SECRET_FILE)throw Error('Private object root and signing secret file required');
const secret=(await readFile(process.env.MANAGED_OBJECT_SECRET_FILE,'utf8')).trim();if(secret.length<32)throw Error('Invalid secret');
const server=objectServer(await diskStore(process.env.MANAGED_OBJECT_ROOT),secret);
server.listen(Number(process.env.PORT??3081),process.env.MANAGED_OBJECT_BIND??'127.0.0.1');
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
