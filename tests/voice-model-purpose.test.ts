import {expect,it,vi} from 'vitest';
import type {VoiceAuth} from '../src/lib/voice-api/auth';
vi.mock('server-only',()=>({}));
vi.mock('../src/lib/elevenlabs/voices',()=>({listWhatsappAudioVoices:vi.fn()}));
const rates=vi.hoisted(()=>({resolve:vi.fn(async()=>[{id:'rate',unit:'character',providerCostPerUnit:.00005,connectyPricePerUnit:.008,minimumChargeCredits:5}])}));
vi.mock('../src/lib/billing/metered-usage',async original=>({...await original<object>(),resolveActiveBillingRates:rates.resolve}));
import {voiceModels,voiceRates} from '../src/lib/voice-api/catalog';
function fixture(){
 const all=[
  {provider_model_id:'eleven_multilingual_v2',feature_code:'text_to_speech'},
  {provider_model_id:'eleven_flash_v2_5',feature_code:'voice_reply_whatsapp'},
  {provider_model_id:'scribe_v2',feature_code:'studio_transcription'},
  {provider_model_id:'eleven_v3',feature_code:'studio_dialogue'},
 ];
 const client={from:()=>{let rows=all;const q={select:()=>q,eq:(key:string,value:string)=>{if(key==='provider_model_id')rows=rows.filter(r=>r.provider_model_id===value);return q;},in:(key:string,values:string[])=>{if(key==='feature_code')rows=rows.filter(r=>values.includes(r.feature_code));return q;},maybeSingle:async()=>({data:rows[0]??null,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve)};return q;}};
 return {client,project:{id:'project'},billingOrg:'wallet',planCode:null} as unknown as VoiceAuth;
}
it('preserves speech models while excluding Studio-only models from the TTS catalog',async()=>{
 const result=await voiceModels(fixture());
 expect(result.models.map(m=>m.model_id)).toEqual(['eleven_multilingual_v2','eleven_flash_v2_5']);
});
it('does not apply the generic character tariff to transcription or dialogue models',async()=>{
 rates.resolve.mockClear();
 await expect(voiceRates(fixture(),'scribe_v2')).rejects.toMatchObject({code:'model_unavailable'});
 await expect(voiceRates(fixture(),'eleven_v3')).rejects.toMatchObject({code:'model_unavailable'});
 expect(rates.resolve).not.toHaveBeenCalled();
 await expect(voiceRates(fixture(),'eleven_multilingual_v2')).resolves.toHaveLength(1);
});
