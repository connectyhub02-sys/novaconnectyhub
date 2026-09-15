import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {diskStore} from '../../services/managed-objects/disk-store.mjs';import {objectServer} from '../../services/managed-objects/server.mjs';
const root=await mkdtemp(join(tmpdir(),'connectyhub-object-pilot-'));
const server=objectServer(await diskStore(root),'LOCAL_OBJECT_PILOT_FICTIONAL_SECRET_NOT_FOR_PRODUCTION');
server.listen(3081,'127.0.0.1',()=>console.log(JSON.stringify({pilot:'private-objects',port:3081,root,fictitious:true})));
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
