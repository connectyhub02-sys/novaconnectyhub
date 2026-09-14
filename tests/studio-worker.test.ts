import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/inngest/client',()=>({inngest:{send:vi.fn()}}));
vi.mock('../src/lib/voice-api/auth',()=>({voiceAccess:vi.fn(async(client,project,keyId)=>({client,project,keyId,planCode:'free',billingOrg:project.organization_id,studio:false})),voiceHash:(s:string)=>createHash('sha256').update(s).digest('hex')}));
vi.mock('../src/lib/voice-api/catalog',()=>({voiceCatalog:vi.fn(async()=>({voices:[]}))}));
vi.mock('../src/lib/voice-api/assets',()=>({ownedStudioAsset:vi.fn(async()=>({id:'asset',status:'ready',duration_seconds:1,size_bytes:6,mime_type:'audio/wav',sha256:createHash('sha256').update('source').digest('hex')})),studioAssetTicket:vi.fn(async()=>({url:'https://relay.example/studio-assets/source',access_key:'ticket'}))}));
vi.mock('../src/lib/voice-api/studio-pricing',()=>({studioPrice:vi.fn()}));
vi.mock('@/lib/elevenlabs/credentials',()=>({loadElevenLabsCredentials:vi.fn(async()=>({apiKey:'private-test-key'}))}));
vi.mock('@/lib/gemini/credentials',()=>({loadGeminiCredentials:vi.fn()}));
vi.mock('../src/lib/voice-api/studio-gemini-provider',()=>({studioGeminiRequest:vi.fn(),requestStudioGemini:vi.fn(),readStudioGeminiResult:vi.fn()}));
vi.mock('../src/lib/voice-api/audio-provider',async(importOriginal)=>({...await importOriginal<object>(),requestStudioAudio:vi.fn()}));
import {requestStudioAudio} from '../src/lib/voice-api/audio-provider';
import {studioPrice} from '../src/lib/voice-api/studio-pricing';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import {runStudioOperation,ownedStudioOperation,sweepStudioOperations} from '../src/lib/voice-api/studio-operations';
const rates=[{id:'rate',unit:'minute',providerCostPerUnit:.01,connectyPricePerUnit:10,minimumChargeCredits:5}];
function fixture(){
 const id=randomUUID(),rows:Record<string,Array<Record<string,unknown>>>={
  voice_projects:[{id:'project',organization_id:'org',name:'Test',status:'active'}],
  voice_generations:[{id,project_id:'project',organization_id:'org',billing_organization_id:'org',key_id:'key',operation:'studio',status:'reserved',reserved_credits:5,charged_credits:0,quoted_credits:5,rate_snapshot:rates,model_id:'scribe_v2'}],
  studio_operations:[{id,operation:'transcription',model_id:'scribe_v2',provider:'elevenlabs',feature_code:'studio_transcription',input:{operation:'transcription',model_id:'scribe_v2',asset_id:randomUUID(),diarize:false},reserved_units:{minutes:1/60},result_manifest:null,storage_reserved_bytes:4_000_000,storage_reserved_files:1}],
 };
 const objects=new Map<string,Blob>();let blockStorage=false,debits=0;
 const client={from:(table:string)=>{
  let filtered=rows[table]??[],update:Record<string,unknown>|null=null;
  const read=()=>{if(update)filtered.forEach(r=>Object.assign(r,update));return {data:structuredClone(filtered),error:null};};
  const q={select:()=>q,eq:(k:string,v:unknown)=>{filtered=filtered.filter(r=>r[k]===v);return q;},in:(k:string,v:unknown[])=>{filtered=filtered.filter(r=>v.includes(r[k]));return q;},update:(value:Record<string,unknown>)=>{update=value;return q;},single:async()=>({data:read().data[0]??null,error:null}),maybeSingle:async()=>({data:read().data[0]??null,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(read()).then(resolve)};return q;
 },rpc:async(name:string,args:Record<string,unknown>)=>{
  const r=rows.voice_generations[0];
  if(name==='start_voice_generation'){
   if(r.status!=='reserved')return {data:null,error:{message:'voice_dispatch_state'}};r.status='processing';return {data:null,error:null};
  }
  if(name==='finish_studio_operation'||name==='fail_reserved_studio_operation'){
   if(!['completed','failed'].includes(String(r.status))){
    r.status=args.p_status??'failed';r.error_code=args.p_error;
    if(args.p_status==='completed'){debits++;r.charged_credits=args.p_charge;r.reserved_credits=0;}
    if(r.status==='failed')r.reserved_credits=0;
   }return {data:structuredClone(r),error:null};
  }throw new Error(`unexpected ${name}`);
 },storage:{from:()=>({upload:async(path:string,bytes:Buffer,options:{contentType:string})=>{
  if(blockStorage)return {error:{message:'unavailable'}};objects.set(path,new Blob([new Uint8Array(bytes)],{type:options.contentType}));return {error:null};
 },download:async(path:string)=>objects.has(path)?{data:objects.get(path),error:null}:{data:null,error:{message:'not found'}}})}} as unknown as SupabaseClient;
 return {id,client,rows,objects,blockStorage:()=>{blockStorage=true;},debits:()=>debits};
}
beforeEach(()=>{
 vi.stubEnv('STUDIO_OPERATIONS_ENABLED','true');vi.stubGlobal('fetch',vi.fn(async()=>new Response('source')));
 vi.mocked(requestStudioAudio).mockReset().mockResolvedValue(Response.json({text:'Synthetic transcript',words:[]}));
 vi.mocked(studioPrice).mockResolvedValue({rates,price:{chargeCredits:5,providerCost:.01}} as Awaited<ReturnType<typeof studioPrice>>);
 vi.mocked(loadElevenLabsCredentials).mockResolvedValue({apiKey:'private-test-key'} as Awaited<ReturnType<typeof loadElevenLabsCredentials>>);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('claims once across duplicate deliveries and charges only a stored result',async()=>{
 const f=fixture();let finish:(r:Response)=>void=()=>{};
 vi.mocked(requestStudioAudio).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=runStudioOperation(f.client,f.id);
 await vi.waitFor(()=>expect(requestStudioAudio).toHaveBeenCalledTimes(1));
 expect((await runStudioOperation(f.client,f.id)).status).toBe('processing');
 finish(Response.json({text:'Synthetic transcript',words:[]}));
 expect((await first).status).toBe('completed');expect(f.debits()).toBe(1);
 expect((await runStudioOperation(f.client,f.id)).status).toBe('completed');expect(requestStudioAudio).toHaveBeenCalledTimes(1);expect(f.debits()).toBe(1);
});
it('retains uncertainty after provider timeout without repeating the POST',async()=>{
 const f=fixture();vi.mocked(requestStudioAudio).mockRejectedValue(new Error('timeout'));
 expect((await runStudioOperation(f.client,f.id)).status).toBe('uncertain');expect(f.rows.voice_generations[0].reserved_credits).toBe(5);
 await runStudioOperation(f.client,f.id);expect(requestStudioAudio).toHaveBeenCalledTimes(1);expect(f.debits()).toBe(0);
});
it('does not debit when storage fails and requires matching bytes/hash on recovery',async()=>{
 const f=fixture();f.blockStorage();expect((await runStudioOperation(f.client,f.id)).status).toBe('uncertain');expect(f.debits()).toBe(0);
 expect(f.rows.studio_operations[0].result_manifest).toBeTruthy();
 await runStudioOperation(f.client,f.id);expect(f.debits()).toBe(0);expect(requestStudioAudio).toHaveBeenCalledTimes(1);
 f.objects.set(`org/project/${f.id}/result`,new Blob(['corrupt']));await expect(runStudioOperation(f.client,f.id)).rejects.toMatchObject({code:'result_invalid'});expect(f.debits()).toBe(0);
 f.objects.set(`org/project/${f.id}/result`,new Blob([JSON.stringify({text:'Synthetic transcript',words:[]})],{type:'application/json'}));
 expect((await runStudioOperation(f.client,f.id)).status).toBe('completed');expect(f.debits()).toBe(1);expect(requestStudioAudio).toHaveBeenCalledTimes(1);
});
it('fails before dispatch if credentials cannot be loaded',async()=>{
 const f=fixture();vi.mocked(loadElevenLabsCredentials).mockRejectedValue(new Error('unavailable'));
 expect((await runStudioOperation(f.client,f.id)).status).toBe('failed');expect(requestStudioAudio).not.toHaveBeenCalled();expect(f.debits()).toBe(0);expect(f.rows.voice_generations[0].reserved_credits).toBe(0);
});
it('does not expose another project operation by a guessed ID',async()=>{
 const f=fixture();const auth={client:f.client,project:{id:'other',organization_id:'org'}} as Parameters<typeof ownedStudioOperation>[0];
 await expect(ownedStudioOperation(auth,f.id)).rejects.toMatchObject({status:404});
});

it('rotates unrecoverable work so later reservations are not starved by the first batch',async()=>{
 const id=randomUUID(),changes:unknown[]=[];
 const client={from:()=>{let updating=false;const q={select:()=>q,eq:()=>q,in:()=>q,lt:()=>q,order:()=>q,limit:async()=>({data:[{id}],error:null}),update:(v:unknown)=>{updating=true;changes.push(v);return q;},maybeSingle:async()=>({data:null,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:updating?null:{message:'unavailable'}}).then(resolve)};return q;}} as unknown as SupabaseClient;
 expect(await sweepStudioOperations(client)).toMatchObject({processed:1,results:[{id,status:'not_found'}]});
 expect(changes).toHaveLength(1);expect(changes[0]).toMatchObject({updated_at:expect.any(String)});
});
