import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {setTimeout as pause} from 'node:timers/promises';
import {telemetryLoop} from './telemetry-loop.mjs';
const endpoint=new URL(process.env.MANAGED_TELEMETRY_URL??'http://127.0.0.1:3082/api/managed-telemetry');
if(endpoint.username||endpoint.password||endpoint.pathname!=='/api/managed-telemetry'||(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname))))throw Error('Private telemetry endpoint required');
if(!process.env.MANAGED_TELEMETRY_KEY_FILE)throw Error('Private telemetry key file required');
const key=(await readFile(process.env.MANAGED_TELEMETRY_KEY_FILE,'utf8')).trim();if(key.length<32)throw Error('Invalid telemetry credential');
const controller=new AbortController();for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>controller.abort());
const exec=promisify(execFile);const collector=fileURLToPath(new URL('./collect-host.py',import.meta.url));
await telemetryLoop({signal:controller.signal,intervalMs:Number(process.env.MANAGED_TELEMETRY_INTERVAL_MS??60000),
 collect:async()=>{const {stdout}=await exec(process.env.MANAGED_PYTHON??'python3',[collector],{timeout:15000,maxBuffer:32768,windowsHide:true,signal:controller.signal});return JSON.parse(stdout);},
 publish:async sample=>{const result=await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(sample),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});if(!result.ok)throw Error('Sample not accepted');},
 pause:async ms=>{try{await pause(ms,undefined,{signal:controller.signal});}catch{}},onState:state=>console.log(JSON.stringify(state))});
