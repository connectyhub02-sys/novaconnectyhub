import {it,expect,vi} from 'vitest';
import * as crypto from 'node:crypto';
import * as policy from '../src/lib/connectyhub-api/coexistence-policy';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Relay from '../src/lib/connectyhub-api/coexistence-events';
function fixture(){
 const payload={object:'whatsapp_business_account',entry:[{id:'777777',changes:[]}]},secret='a'.repeat(64);
 const receipt={id:'event',connection_id:'binding',payload,delivered_at:null as string|null,attempts:0,last_error:null};
 const owner={organization_id:'org',status:'active',metadata:{meta_coexistence_enabled:true,meta_coexistence_instances:['public-instance'],meta_coexistence_callback_origin:'https://vision.test'}};
 const binding={id:'binding',client_id:'client',organization_id:'org',instance_id:'instance',public_instance_id:'public-instance',owner_phone:'554774006565',state:'linked',callback_url:'https://vision.test/api/webhooks/meta?company=00000000-0000-0000-0000-000000000001',callback_secret_encrypted:'encrypted'};
 const instance={organization_id:'org',connectyhub_api_client_id:'client',connectyhub_api_instance_id:'public-instance',phone_number:'554774006565',status:'connected'};
 const client={from(table:string){let update:any;const q:any={select(){return q},eq(){return q},single(){return q},maybeSingle(){return q},update(v:any){update=v;return q},then(resolve:any){
  const data=table==='connectyhub_meta_coexistence_events'?receipt:table==='connectyhub_meta_coexistence'?binding:table==='connectyhub_api_clients'?owner:table==='whatsapp_instances'?instance:[{url:'https://vision.test/api/webhooks/connectyhub'}];
  if(update)Object.assign(data,update);return Promise.resolve({data,error:null}).then(resolve);
 }};return q}};
 const fetch=vi.fn(async()=>new Response('{}',{status:200}));
 const api=serverModuleHarness<typeof Relay>('src/lib/connectyhub-api/coexistence-events.ts',{'node:crypto':crypto,'./coexistence-policy':policy,'@/lib/security/credentials-crypto':{decryptCredentialValue:()=>secret}},[],{fetch});
 return {api,client:client as any,receipt,owner,instance,binding,fetch,secret};
}
it('signs the exact customer payload, does not follow redirects and acknowledges only successful delivery',async()=>{
 const f=fixture();await f.api.deliverCoexistenceEvent('event',f.client);
 const [url,options]=f.fetch.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe(f.binding.callback_url);expect(options.redirect).toBe('error');
 const signature=crypto.createHmac('sha256',f.secret).update(String(options.body)).digest('hex');
 expect((options.headers as any)['x-hub-signature-256']).toBe('sha256='+signature);expect(f.receipt.delivered_at).toBeTruthy();
 await f.api.deliverCoexistenceEvent('event',f.client);expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('revalidates client and instance ownership before transmission',async()=>{
 const f=fixture();f.instance.organization_id='other';await expect(f.api.deliverCoexistenceEvent('event',f.client)).rejects.toThrow(/not active/);expect(f.fetch).not.toHaveBeenCalled();
 const g=fixture();g.owner.metadata.meta_coexistence_enabled=false;await expect(g.api.deliverCoexistenceEvent('event',g.client)).rejects.toThrow(/not active/);expect(g.fetch).not.toHaveBeenCalled();
});
it('leaves a rejected receipt pending for durable retry',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response('failure',{status:503}));await expect(f.api.deliverCoexistenceEvent('event',f.client)).rejects.toThrow(/not acknowledged/);
 expect(f.receipt.delivered_at).toBeNull();expect(f.receipt.last_error).toBe('HTTP 503');expect(f.receipt.attempts).toBe(1);
});
