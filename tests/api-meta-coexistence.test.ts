import {describe,it,expect,vi} from 'vitest';
import * as crypto from 'node:crypto';
import * as policy from '../src/lib/connectyhub-api/coexistence-policy';
import {partitionCoexistenceEvents} from '../src/lib/connectyhub-api/coexistence-partition';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Bridge from '../src/lib/connectyhub-api/coexistence';
const phone='554774006565',id='instance-1',callback='https://vision.test/api/webhooks/meta?company=00000000-0000-0000-0000-000000000001';
function fixture(){
 let connection:Record<string,any>|null=null;
 const instance={id:'internal-1',organization_id:'org',phone_number:phone,status:'connected'};
 const metadata={meta_coexistence_enabled:true,meta_coexistence_config_id:'1802160894354148',meta_coexistence_callback_origin:'https://vision.test',meta_coexistence_instances:[id]};
 const client={from(table:string){let mutation:Record<string,any>|null=null,insert=false,filters:Array<[string,unknown]>=[],nulls:string[]=[],future:string[]=[];
  const q:any={select(){return q},eq(k:string,v:unknown){filters.push([k,v]);return q},is(k:string){nulls.push(k);return q},gt(k:string){future.push(k);return q},update(v:any){mutation=v;return q},upsert(v:any){mutation=v;insert=true;return q},maybeSingle(){return q},single(){return q},then(resolve:any){
   let data:any=null;
   if(table==='connectyhub_meta_coexistence'){
    if(insert&&!connection)connection={id:'binding',state:'prepared',waba_id:null,nonce_consumed_at:null,...mutation};
    const match=connection&&filters.every(([k,v])=>connection![k]===v)&&nulls.every(k=>connection![k]==null)&&future.every(k=>Date.parse(connection![k])>Date.now());
    if(match&&mutation&&!insert)Object.assign(connection!,mutation);
    if(match)data={...connection};
   }else if(table==='connectyhub_webhook_endpoints')data=[{url:'https://vision.test/api/webhooks/connectyhub'}];
   return Promise.resolve({data,error:null}).then(resolve);
  }};return q;
 }};
 let different=false;
 const graph=vi.fn(async(_config:any,_token:string,path:string,_body?:any)=>{
  if(path.endsWith('/subscriptions'))return {data:[{object:'whatsapp_business_account',active:true,callback_url:new URL('/api/webhooks/meta',process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||'https://www.connectyhub.com.br').toString(),fields:policy.coexistenceFields.map(name=>({name}))}]};
  if(path==='oauth/access_token')return {access_token:'private-token'};
  if(path==='debug_token')return {data:{app_id:'1002348522666389',is_valid:true,scopes:['whatsapp_business_management','whatsapp_business_messaging']}};
  if(path.endsWith('/phone_numbers'))return {data:[{id:'123456',display_phone_number:different?'551188888888':phone,is_on_biz_app:true,platform_type:'CLOUD_API'}]};
  if(path.endsWith('/subscribed_apps'))return {success:true};
  if(path.endsWith('/smb_app_data'))throw Error('uncertain');
  if(path.endsWith('/messages'))return {messages:[{id:'wamid.test-only'}]};
  throw Error('Unexpected external operation');
 });
 class GatewayHttpError extends Error{constructor(public status:number,public code:string,message:string){super(message)}}
 const api=serverModuleHarness<typeof Bridge>('src/lib/connectyhub-api/coexistence.ts',{'node:crypto':crypto,'./gateway':{GatewayHttpError,requireGatewayInstance:async()=>instance,refreshGatewayInstanceStatus:async()=>({status:'connected',phoneNumber:phone})},'@/lib/meta/whatsapp-cloud':{officialSettings:async()=>({appId:'1002348522666389',appSecret:'private-app-secret',signupConfigId:'123456',graphVersion:'v25.0'}),cloudRequest:graph},'@/lib/security/credentials-crypto':{encryptCredentialValue:(v:string)=>`encrypted:${v}`,decryptCredentialValue:(v:string)=>v.slice(10)},'./coexistence-policy':policy});
 return {api,graph,metadata,auth:{client,apiClient:{id:'client',organization_id:'org',metadata},apiKey:{id:'key'} } as any,get connection(){return connection!},different:()=>different=true};
}
describe('managed coexistence boundary',()=>{
 it('permits only the owned Business+Cloud number and approved callback',()=>{
  expect(policy.verifiedBusinessPhone([{id:'123456',display_phone_number:'+55 47 97400-6565',is_on_biz_app:true,platform_type:'CLOUD_API'}],phone).id).toBe('123456');
  expect(()=>policy.verifiedBusinessPhone([{id:'123456',display_phone_number:phone,is_on_biz_app:false,platform_type:'CLOUD_API'}],phone)).toThrow();
  expect(policy.coexistenceCallback(callback,'https://vision.test',['https://vision.test/api/webhooks/connectyhub'])).toBe(callback);
  for(const value of [callback.replace('vision.test','attacker.test'),callback+'&company=x',callback.replace('https:','http:'),callback.replace('/api/webhooks/meta','/redirect')])expect(()=>policy.coexistenceCallback(value,'https://vision.test',['https://vision.test/x'])).toThrow();
  expect(()=>policy.coexistenceGraphPath('999999/messages','777777','123456','POST')).toThrow();
 });
 it('requires explicit client and instance enablement before accessing a number',async()=>{
  const f=fixture();f.metadata.meta_coexistence_enabled=false;
  await expect(f.api.getCoexistenceStatus(f.auth,id)).rejects.toThrow(/habilitada/);
  f.metadata.meta_coexistence_enabled=true;await expect(f.api.getCoexistenceStatus(f.auth,'other')).rejects.toThrow(/habilitado/);expect(f.graph).not.toHaveBeenCalled();
 });
 it('rejects wrong API key, expired nonce and replay before code exchange',async()=>{
  const f=fixture(),start=await f.api.startCoexistence(f.auth,id,{callbackUrl:callback,callbackSecret:'a'.repeat(64)}),body={nonce:start.nonce,wabaId:'777777',code:'code'};
  f.auth.apiKey.id='other';await expect(f.api.finishCoexistence(f.auth,id,body)).rejects.toThrow(/expirado/);f.auth.apiKey.id='key';
  f.connection.nonce_expires_at='invalid';await expect(f.api.finishCoexistence(f.auth,id,body)).rejects.toThrow(/expirado/);
  expect(f.graph.mock.calls.some(c=>c[2]==='oauth/access_token')).toBe(false);
  f.connection.nonce_expires_at=new Date(Date.now()+60000).toISOString();await f.api.finishCoexistence(f.auth,id,body);
  await expect(f.api.finishCoexistence(f.auth,id,body)).rejects.toThrow(/expirado/);
  expect(f.graph.mock.calls.filter(c=>c[2]==='oauth/access_token')).toHaveLength(1);
  const status=await f.api.getCoexistenceStatus(f.auth,id);expect(JSON.stringify(status)).not.toMatch(/private-token|encrypted:|private-app-secret/);expect(status.campaignsEnabled).toBe(false);
  expect(f.graph.mock.calls.some(c=>c[2].endsWith('/register'))).toBe(false);
 });
 it('cannot link a different phone or send campaigns; uncertain sync is not repeated',async()=>{
  const f=fixture(),start=await f.api.startCoexistence(f.auth,id,{callbackUrl:callback,callbackSecret:'a'.repeat(64)});f.different();
  await expect(f.api.finishCoexistence(f.auth,id,{nonce:start.nonce,wabaId:'777777',code:'code'})).rejects.toThrow(/mesmo número/);expect(f.connection.token_encrypted).toBeUndefined();
  const g=fixture(),ready=await g.api.startCoexistence(g.auth,id,{callbackUrl:callback,callbackSecret:'a'.repeat(64)});await g.api.finishCoexistence(g.auth,id,{nonce:ready.nonce,wabaId:'777777',code:'code'});
  await expect(g.api.proxyCoexistenceGraph(g.auth,id,{method:'POST',path:'123456/messages',body:{}})).rejects.toThrow(/teste real/);
  const sync={method:'POST',path:'123456/smb_app_data',body:{messaging_product:'whatsapp',sync_type:'history'}};
  await expect(g.api.proxyCoexistenceGraph(g.auth,id,sync)).rejects.toThrow(/uncertain/);await expect(g.api.proxyCoexistenceGraph(g.auth,id,sync)).rejects.toThrow(/já foi/);
  expect(g.graph.mock.calls.filter(c=>c[2].endsWith('/smb_app_data'))).toHaveLength(1);expect(g.connection.history_sync_state).toBe('uncertain');
 });
 it('partitions batched WABAs and excludes echoes/history from the ordinary AI path',()=>{
  const change=(field:string,p='123456')=>({field,value:{metadata:{phone_number_id:p},messages:[{text:'private'}]}});
  const root={object:'whatsapp_business_account',entry:[{id:'777777',changes:[change('history'),change('smb_message_echoes'),change('messages','999999'),change('unexpected')]},{id:'888888',changes:[change('messages','222222')]}]};
  const result=partitionCoexistenceEvents(root,[{id:'binding',waba_id:'777777',phone_number_id:'123456'}]);
  expect(result.relays).toHaveLength(2);expect(JSON.stringify(result.relays)).not.toContain('888888');expect(JSON.stringify(result.ordinary)).not.toContain('777777');
  expect(partitionCoexistenceEvents({entry:[{id:'partner',changes:[{field:'account_update',value:{event:'PARTNER_REMOVED',waba_info:{waba_id:'777777'}}}]}]},[{id:'binding',waba_id:'777777',phone_number_id:'123456'}]).relays).toHaveLength(1);
 });
 it('only explicitly released owned senders can send; expiry and foreign phone stay blocked',async()=>{
  const f=fixture(),start=await f.api.startCoexistence(f.auth,id,{callbackUrl:callback,callbackSecret:'a'.repeat(64)});
  await f.api.finishCoexistence(f.auth,id,{nonce:start.nonce,wabaId:'777777',code:'code'});
  const message={method:'POST',path:'123456/messages',body:{messaging_product:'whatsapp',type:'text',to:'5547999999999',text:{body:'Test only'}}};
  await expect(f.api.proxyCoexistenceGraph(f.auth,id,message)).rejects.toThrow(/liberação/);
  await f.api.enableCoexistenceSending(f.auth,id);
  expect(f.connection.campaigns_enabled).toBe(true);
  expect(await f.api.proxyCoexistenceGraph(f.auth,id,message)).toEqual({messages:[{id:'wamid.test-only'}]});
  await expect(f.api.proxyCoexistenceGraph(f.auth,id,{...message,path:'999999/messages'})).rejects.toThrow(/fora/);
  f.connection.token_expires_at='2020-01-01';await expect(f.api.proxyCoexistenceGraph(f.auth,id,message)).rejects.toThrow(/expirada/);
  expect(f.graph.mock.calls.filter(c=>c[2].endsWith('/messages'))).toHaveLength(1);
 });
});
