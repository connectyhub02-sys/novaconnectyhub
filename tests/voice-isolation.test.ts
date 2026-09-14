import {it,expect,vi,beforeEach} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {VoiceAuth} from '../src/lib/voice-api/auth';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/elevenlabs/voices',()=>({listWhatsappAudioVoices:vi.fn(async()=>({configured:true,errorMessage:null,voices:[
 {voiceId:'common',name:'Common',category:'premade',source:'elevenlabs',previewUrl:null},
 {voiceId:'other-secret',name:'Other customer',category:'cloned',source:'elevenlabs',previewUrl:'https://private.example.com'},
 {voiceId:'default-secret',name:'Private default',category:'cloned',source:'platform',previewUrl:null},
 {voiceId:'library',name:'Library',category:'professional',source:'library',previewUrl:null},
]}))}));
vi.mock('@/lib/elevenlabs/credentials',()=>({loadElevenLabsCredentials:vi.fn(async()=>({apiKey:'test-secret'}))}));
import {ownedClone,editPrivateClone,deletePrivateClone,cloneSamples,previewPrivateClone} from '../src/lib/voice-api/clones';
import {voiceCatalog} from '../src/lib/voice-api/catalog';
import {downloadVoice,voiceGeneration} from '../src/lib/voice-api/generations';
const rows={voice_clones:[{id:'11111111-1111-4111-8111-111111111111',project_id:'project-a',organization_id:'org-a',provider_voice_id:'private-a',name:'A',status:'ready',voice_generations:{status:'completed'},origin:'api',generation_id:'receipt-a'}],voice_generations:[{id:'22222222-2222-4222-8222-222222222222',project_id:'project-a',organization_id:'org-a',status:'completed',object_path:'secret/audio.mp3'}]};
function auth(project='project-a',org='org-a'):VoiceAuth{
 const client={from:(table:keyof typeof rows)=>{
  let filtered:Record<string,unknown>[]=[...(rows[table]??[])];
  const q={select:()=>q,eq:(key:string,value:unknown)=>{filtered=filtered.filter(r=>r[key]===value);return q;},neq:(key:string,value:unknown)=>{filtered=filtered.filter(r=>r[key]!==value);return q;},not:(key:string,_op:string,value:unknown)=>{filtered=filtered.filter(r=>r[key]!==value);return q;},maybeSingle:async()=>({data:filtered[0]??null,error:null}),then:(resolve:(data:unknown)=>unknown)=>Promise.resolve({data:filtered,error:null}).then(resolve)};return q;
 },storage:{from:vi.fn()}} as unknown as SupabaseClient;
 return {client,project:{id:project,organization_id:org,name:'Test',status:'active',monthly_credit_limit:null},keyId:'rotated-key',planCode:'scale',billingOrg:org,studio:false};
}
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn());});
it('does not leak private/provider library voices and keeps owned project clones',async()=>{
 const a=await voiceCatalog(auth());expect(a.voices.map(v=>v.voice_id)).toEqual(['common','private-a']);
 const b=await voiceCatalog(auth('project-b','org-b'));expect(b.voices.map(v=>v.voice_id)).toEqual(['common']);
 const sibling=await voiceCatalog(auth('project-b','org-a'));expect(sibling.voices.map(v=>v.voice_id)).toEqual(['common']);
});
it('blocks direct IDs in detail, edits, delete, sample/preview and audio before provider/storage access',async()=>{
 for(const b of [auth('project-b','org-b'),auth('project-b','org-a')]){
  await expect(ownedClone(b,'private-a')).rejects.toMatchObject({status:404});
  await expect(editPrivateClone(b,'private-a',new Request('https://example.com',{method:'PATCH',body:'{"name":"Other"}'}))).rejects.toMatchObject({status:404});
  await expect(deletePrivateClone(b,'private-a')).rejects.toMatchObject({status:404});
  await expect(cloneSamples(b,'private-a','sample-a')).rejects.toMatchObject({status:404});
  await expect(previewPrivateClone(b,'private-a',new Request('https://example.com'))).rejects.toMatchObject({status:404});
  await expect(downloadVoice(b,rows.voice_generations[0].id)).rejects.toMatchObject({status:404});
  expect(b.client.storage.from).not.toHaveBeenCalled();
 }
 expect(fetch).not.toHaveBeenCalled();
});
it('key rotation preserves ownership through the project and account',async()=>{
 const a=auth();expect((await ownedClone(a,'private-a')).name).toBe('A');
 a.keyId='another-key';expect((await ownedClone(a,'private-a')).name).toBe('A');
 expect((await voiceGeneration(a,rows.voice_generations[0].id)).status).toBe('completed');
});
