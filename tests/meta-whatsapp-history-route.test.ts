import {describe,it,expect,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
import {officialAssetId} from '../src/lib/meta/whatsapp-policy';
import {serverModuleHarness} from './helpers/server-module-harness';
class AccessError extends Error{constructor(message:string,public status:number){super(message);}}
function fixture(ownsHistory:boolean){
 const scopes:Array<[string,string,unknown]>=[];
 const client={from:(table:string)=>{const q={select:()=>q,eq:(k:string,v:unknown)=>{scopes.push([table,k,v]);return q;},limit:()=>q,order:async()=>({error:null,data:[]}),maybeSingle:async()=>({error:null,data:ownsHistory?{phone_number_id:'123456'}:null})};return q;}};
 const inbox=vi.fn(async()=>({messages:[{id:'own-history'}]})),send=vi.fn(),templates=vi.fn();
 const route=serverModuleHarness<typeof import('../src/app/api/dashboard/integrations/meta/whatsapp/route')>('src/app/api/dashboard/integrations/meta/whatsapp/route.ts',{
  'next/server':{NextResponse},'@/lib/meta/whatsapp-auth':{officialAccess:async()=>({client,organizationId:'org-a',actorId:'actor'}),OfficialAccessError:AccessError},
  '@/lib/meta/whatsapp-cloud':{officialSettings:async()=>({}),officialConnection:async()=>null,listOfficialTemplates:templates,sendOfficialMessage:send},
  '@/lib/meta/whatsapp-inbox':{officialInbox:inbox},'@/lib/meta/whatsapp-policy':{officialAssetId},
 },[],{Error});return {route,inbox,send,templates,scopes};
}
describe('historical official sender access',()=>{
 it('preserves own historical messages after transfer without returning the new owner connection',async()=>{
  const f=fixture(true),r=await f.route.GET(new NextRequest('https://www.connectyhub.com.br/api?sender=123456&companyId=other'));
  expect(r.status).toBe(200);expect(await r.json()).toMatchObject({connection:null,connections:[],selectedSender:'123456',messages:[{id:'own-history'}]});
  expect(f.scopes).toContainEqual(['meta_whatsapp_threads','organization_id','org-a']);expect((f.inbox.mock.calls[0] as unknown[])[1]).toBe('org-a');expect(f.templates).not.toHaveBeenCalled();
 });
 it('does not expose a sender with no local connection or history',async()=>{
  const f=fixture(false),r=await f.route.GET(new NextRequest('https://www.connectyhub.com.br/api?sender=123456'));expect(r.status).toBe(404);expect(f.inbox).not.toHaveBeenCalled();
 });
 it('never permits sending through a transferred historical sender',async()=>{
  const f=fixture(true),r=await f.route.POST(new NextRequest('https://www.connectyhub.com.br/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',sender:'123456'})}));expect(r.status).toBe(422);expect(f.send).not.toHaveBeenCalled();
 });
});
