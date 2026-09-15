import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const project='30000000-0000-4000-8000-000000000001',other='30000000-0000-4000-8000-000000000003';const object=randomUUID(),base='http://127.0.0.1:3026/api/managed-projects';
const path=`${base}/${project}/objects/${object}`;const content={action:'put',name:'private-object.txt',base64:Buffer.from('private sidecar bytes').toString('base64')};
async function call(url=path,identity='connectyhub',body){return fetch(url,{method:body?'POST':'GET',headers:{cookie:`pilot_identity=${identity}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
let checks=0;function check(value,label){assert.ok(value,label);checks++;}
check((await call(path,'leitura',content)).status===409,'viewer cannot upload');
let created=await call(path,'connectyhub',content);check(created.status===200,await created.text());
check((await call(path,'connectyhub',content)).status===200,'retry upload idempotent');
check(await(await call()).text()==='private sidecar bytes','download verified');
check((await call(path,'betel')).status===404,'other client denied');
check((await call(`${base}/${other}/objects/${object}`,'betel')).status===404,'other project denied');
check((await call(path,'connectyhub',{...content,base64:Buffer.from('different').toString('base64')})).status===409,'immutable object metadata');
const snapshot=await(await call(`${base}/${project}`)).json();check(snapshot.objects.some(o=>o.id===object&&o.status==='ready'),'catalog ready');check(snapshot.usage.filter(o=>o.operation_id===object&&o.unit==='stored_bytes').length===1,'one usage entry');
check((await call(path,'connectyhub',{action:'delete'})).status===200,'delete');check((await call(path,'connectyhub',{action:'delete'})).status===200,'delete idempotent');check((await call()).status===404,'deleted invisible');check((await call(path,'connectyhub',content)).status===409,'cannot resurrect deleted id');
console.log(JSON.stringify({passed:true,checks,transport:'real loopback HTTP to disk sidecar',production_mutations:0,paid_calls:0}));
