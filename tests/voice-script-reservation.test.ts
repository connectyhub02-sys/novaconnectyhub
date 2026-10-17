import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {serverModuleHarness} from './helpers/server-module-harness';
import * as contract from '../src/lib/voice-api/contract';
import type * as Generations from '../src/lib/voice-api/generations';
import type {VoiceAuth} from '../src/lib/voice-api/auth';

function fixture(){
  const provider=vi.fn(),rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:{id:'receipt',claimed:true,status:name==='finish_voice_generation'?args.p_status:'reserved'},error:null}));
  const updates:unknown[]=[];
  const client={rpc,from:()=>{
    const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null}),update:(data:unknown)=>{updates.push(data);return q;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:null,error:{message:'storage unavailable'}}).then(resolve)};return q;
  }};
  const editorModule=serverModuleHarness<typeof Generations>('src/lib/voice-api/generations.ts',{
    './contract':contract,'./auth':{voiceHash:(s:string)=>createHash('sha256').update(s).digest('hex')},
    './catalog':{voiceCatalog:async()=>({voices:[{voice_id:'clone',status:'ready'}]}),quoteVoice:async()=>({rates:[],price:{chargeCredits:10,providerCost:1}})},
    './studio-dictionaries':{resolveStudioDictionaries:async()=>[]},
    '@/lib/elevenlabs/credentials':{loadElevenLabsCredentials:async()=>({apiKey:'test'})},
    '@/lib/storage/quotas':{assertStorageUploadAllowed:async()=>{}},'./provider':{requestVoiceAudio:provider},
  });
  return {module:editorModule,provider,rpc,updates,auth:{client,project:{id:'p',organization_id:'o'},keyId:null,studio:true} as unknown as VoiceAuth};
}
it('does not request paid audio if the recoverable script cannot be saved',async()=>{
  const f=fixture();
  await expect(f.module.generateVoice(f.auth,new Request('https://example.test',{headers:{'Idempotency-Key':'test'}}),{text:'Minha fala',voice_id:'clone'})).rejects.toMatchObject({code:'service_unavailable'});
  expect(f.updates).toEqual([expect.objectContaining({studio_script:expect.objectContaining({text:'Minha fala',voice_id:'clone'})})]);
  expect(f.provider).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledWith('finish_voice_generation',{p_id:'receipt',p_status:'failed',p_error:'script_pending'});
});
it('rejects a changed price before reserving or contacting the provider',async()=>{
  const f=fixture();
  await expect(f.module.generateVoice(f.auth,new Request('https://example.test',{headers:{'Idempotency-Key':'test','X-Max-Credits':'5'}}),{text:'Minha fala',voice_id:'clone'})).rejects.toMatchObject({code:'quote_changed'});
  expect(f.provider).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();
});
