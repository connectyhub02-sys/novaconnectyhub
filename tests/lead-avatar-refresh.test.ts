import {it,expect,vi} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Avatar from '@/lib/whatsapp/lead-avatar-sync';
const now=Date.parse('2026-10-26T21:00:00Z'),old='2026-10-12T01:00:00Z',fresh='2026-10-26T20:00:00Z',url='https://pps.whatsapp.net/v/photo.jpg';
const module=()=>serverModuleHarness<typeof Avatar>('src/lib/whatsapp/lead-avatar-sync.ts');
it('renews stale WhatsApp photos even when the old URL is present',()=>{
 const m=module();expect(m.shouldAttemptLeadAvatarSync({profile_image_url:url,profile_image_synced_at:old},now)).toBe(true);
 expect(m.shouldAttemptLeadAvatarSync({profile_image_url:url,profile_image_synced_at:fresh},now)).toBe(false);
 expect(m.shouldAttemptLeadAvatarSync({profile_image_url:url},now)).toBe(true);
 expect(m.shouldAttemptLeadAvatarSync({},now)).toBe(true);
 expect(m.shouldAttemptLeadAvatarSync({profile_image_url:'https://storage.example.test/manual.jpg'},now)).toBe(false);
});
it('renews an explicitly expiring CDN URL and backs off on missing/private photos or a running lookup',()=>{
 const m=module();expect(m.shouldAttemptLeadAvatarSync({profile_image_url:url+'?oe='+Math.floor((now-1000)/1000).toString(16),profile_image_synced_at:fresh},now)).toBe(true);
 expect(m.shouldAttemptLeadAvatarSync({profile_image_url:url,profile_image_synced_at:old,profile_image_sync_status:'not_found',profile_image_last_attempt_at:fresh},now)).toBe(false);
 expect(m.shouldAttemptLeadAvatarSync({profile_image_refresh_started_at:new Date(now-1000).toISOString()},now)).toBe(false);
});
it('reserves a refresh, fetches only photo details with timeout and returns the atomic metadata merge',async()=>{
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({error:null,data:name==='claim_lead_avatar_sync'?{claim:'lease',metadata:{person_name:'Nome preservado'}}:{...args.p_patch as object,human_handoff:{status:'paused'}}}));
 const fetch=vi.fn(async(_url:unknown,_options:unknown)=>new Response(JSON.stringify({image:url}),{status:200}));
 const m=serverModuleHarness<typeof Avatar>('src/lib/whatsapp/lead-avatar-sync.ts',{'@/lib/security/credentials-crypto':{decryptCredentialValue:()=> 'fixture-token'},'./uazapi-credentials':{loadUazapiCredentials:async()=>({baseUrl:'https://provider.example.test'})}},[],{fetch});
 const result=await m.syncLeadAvatarFromUazapi({client:{rpc} as never,leadId:'lead',phoneNumber:'5511999990000',instance:{id:'sender',instance_token_encrypted:'fixture'},existingMetadata:{profile_image_url:url,profile_image_synced_at:old}});
 expect(result?.profile_image_url).toBe(url);expect(result?.human_handoff).toEqual({status:'paused'});
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['claim_lead_avatar_sync','complete_lead_avatar_sync']);
 expect(fetch).toHaveBeenCalledOnce();expect(fetch.mock.calls[0][0]).toBe('https://provider.example.test/chat/details');
 expect((fetch.mock.calls[0] as unknown[])[1]).toMatchObject({method:'POST',cache:'no-store',signal:expect.any(AbortSignal)});
});
it('does not call the provider if another page already reserved the photo',async()=>{
 const fetch=vi.fn();const m=serverModuleHarness<typeof Avatar>('src/lib/whatsapp/lead-avatar-sync.ts',{'@/lib/security/credentials-crypto':{decryptCredentialValue:()=> 'fixture-token'}},[],{fetch});
 expect(await m.syncLeadAvatarFromUazapi({client:{rpc:async()=>({data:null})} as never,leadId:'lead',phoneNumber:'5511999990000',instance:{id:'sender',instance_token_encrypted:'fixture'}})).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
