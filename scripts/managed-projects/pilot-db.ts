import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {managedDatabaseFixture,ids} from '../../tests/helpers/managed-database';
export const context=new AsyncLocalStorage<{user:string}>();
export const users={admin:ids.admin,produto:ids.productAdmin,connectyhub:ids.a,betel:ids.b,leitura:ids.viewer};
export const pilotKey='mpw_LOCAL_DIAGNOSTIC_ONLY_NOT_A_REAL_CREDENTIAL';
const init=managedDatabaseFixture().then(async f=>{
 await f.db.query("update managed_projects set name='ConnectyHub',slug='connectyhub' where id=$1",[ids.pA]);
 await f.db.query("update managed_projects set name='Betel',slug='betel' where id=$1",[ids.pB]);
 const org='10000000-0000-4000-8000-000000000003';await f.db.query("insert into organizations values($1,'Cliente Vision')",[org]);
 await f.db.query("update managed_projects set name='Vision',slug='vision',organization_id=$2,status='draft' where id=$1",[ids.pA2,org]);
 await f.db.query("update managed_workers set key_hash=$1 where project_id=$2",[createHash('sha256').update(pilotKey).digest('hex'),ids.pA]);
 await f.db.query("insert into managed_records(project_id,organization_id,collection,data) values($1,$2,'notes','{\"text\":\"Registro fictício do piloto\"}')",[ids.pA,ids.orgA]);
 return f;
});
const ident=(s:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('Invalid SQL identifier');return `"${s}"`;};
export async function query(sql:string,args:unknown[]=[],service=false){const f=await init;const user=context.getStore()?.user??ids.a;return f.db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await tx.exec(`set local role ${service?'service_role':'authenticated'}`);return tx.query<Record<string,unknown>>(sql,args);});}
export function pilotClient(service=false){return {
 from(table:string){let operation='select';let fields='*';let values:Record<string,unknown>|undefined;const filters:[string,unknown][]=[];let order:string|undefined;let limit=200;let single=false;let conflict='';
 const builder={select(s='*'){fields=s;return builder;},eq(k:string,v:unknown){filters.push([k,v]);return builder;},order(k:string,o:{ascending:boolean}={ascending:true}){order=`${ident(k)} ${o.ascending?'asc':'desc'}`;return builder;},limit(n:number){limit=n;return builder;},maybeSingle(){single=true;return builder;},single(){single=true;return builder;},insert(v:Record<string,unknown>){operation='insert';values=v;return builder;},update(v:Record<string,unknown>){operation='update';values=v;return builder;},upsert(v:Record<string,unknown>,o:{onConflict:string}){operation='insert';values=v;conflict=o.onConflict;return builder;},delete(){operation='delete';return builder;},then(onfulfilled: (r:unknown)=>unknown,onrejected?: (e:unknown)=>unknown){return execute().then(onfulfilled,onrejected);}};
 async function execute(){try{const args:unknown[]=[];const bind=(v:unknown)=>{args.push(v);return `$${args.length}`;};const selection=fields==='*'?'*':fields.split(',').map(ident).join(',');const t=`public.${ident(table)}`;let sql='';
 if(operation==='insert'){const entries=Object.entries(values!);sql=`insert into ${t} (${entries.map(([k])=>ident(k)).join(',')}) values(${entries.map(([,v])=>bind(v)).join(',')})`;if(conflict)sql+=` on conflict (${conflict.split(',').map(ident).join(',')}) do update set ${entries.filter(([k])=>!conflict.split(',').includes(k)).map(([k])=>`${ident(k)}=excluded.${ident(k)}`).join(',')}`;sql+=` returning ${selection}`;}
 else {sql=operation==='update'?`update ${t} set ${Object.entries(values!).map(([k,v])=>`${ident(k)}=${bind(v)}`).join(',')}`:operation==='delete'?`delete from ${t}`:`select ${selection} from ${t}`;if(filters.length)sql+=` where ${filters.map(([k,v])=>`${ident(k)}=${bind(v)}`).join(' and ')}`;if(operation==='select'){if(order)sql+=` order by ${order}`;sql+=` limit ${bind(limit)}`;}else sql+=` returning ${selection}`;}
 const r=await query(sql,args,service);return {data:single?r.rows[0]??null:r.rows,error:null};}catch(e){return {data:null,error:e};}}
 return builder;
 },async rpc(name:string,args:Record<string,unknown>={}){try{const entries=Object.entries(args);const sql=name==='managed_companies'?'select * from public.managed_companies()':`select public.${ident(name)}(${entries.map(([k],i)=>`${ident(k)}=>$${i+1}`).join(',')}) result`;const r=await query(sql,entries.map(([,v])=>v),service);return {data:name==='managed_companies'?r.rows:r.rows[0]?.result,error:null};}catch(e){return {data:null,error:e};}}
 };}
export const createServiceClient=()=>pilotClient(true);
