import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {parseStudioInput,studioInputUnits,studioCreditCeiling} from '../src/lib/voice-api/studio-contract';
import {confirmedStudioRates} from '../src/lib/voice-api/studio-pricing';
it('rejects client costs, URLs, fake duration and parameters from other operations',()=>{
 const input={operation:'transcription',asset_id:'11111111-1111-4111-8111-111111111111'};
 for(const extra of [{duration_seconds:1},{cost:0},{url:'https://example.com/file'},{voice_id:'unrelated'}])expect(()=>parseStudioInput({...input,...extra})).toThrow();
 expect(parseStudioInput(input)).toMatchObject({operation:'transcription',diarize:false});
 expect(studioInputUnits(parseStudioInput(input),1.125)).toEqual({minutes:2/60});
 expect(()=>studioInputUnits(parseStudioInput(input))).toThrow();
});
it('bounds dialogue and validates immutable pronunciation rules',()=>{
 expect(()=>parseStudioInput({operation:'dialogue',turns:[{text:'x'.repeat(1500),voice_id:'one'},{text:'x'.repeat(501),voice_id:'two'}]})).toThrow();
 const dictionary=parseStudioInput({operation:'dictionary_create',name:'Terms',rules:[{type:'alias',string_to_replace:'CH',alias:'ConnectyHub'}]});expect(studioInputUnits(dictionary)).toEqual({requests:1});
 expect(()=>parseStudioInput({operation:'dictionary_create',name:'Terms',rules:[{type:'alias',string_to_replace:'CH',alias:'ConnectyHub',workspace_access:'editor'}]})).toThrow();
});
it('requires confirmation of the exact effective tariff values and one billing basis',()=>{
 const rates=[{id:'one',unit:'minute',providerCostPerUnit:.5,connectyPricePerUnit:200,minimumChargeCredits:5}];
 expect(confirmedStudioRates(rates,rates,'transcription')).toEqual(rates);
 expect(()=>confirmedStudioRates([{...rates[0],providerCostPerUnit:1}],rates,'transcription')).toThrow();
 expect(()=>confirmedStudioRates(rates,[],'transcription')).toThrow();
 expect(()=>confirmedStudioRates([...rates,{...rates[0],unit:'request'}],rates,'transcription')).toThrow();
 expect(()=>confirmedStudioRates([{...rates[0],unit:'character'}],rates,'gemini_tts')).toThrow();
});
it('rejects price increases beyond the customer ceiling before any reservation',()=>{
 const request=(limit:string)=>new Request('https://example.com',{headers:{'X-Max-Credits':limit}});
 expect(()=>studioCreditCeiling(request('5'),5)).not.toThrow();
 expect(()=>studioCreditCeiling(request('5'),6)).toThrow('excede');
 for(const value of ['NaN','Infinity','-1','1e9','0xFF'])expect(()=>studioCreditCeiling(request(value),5)).toThrow();
});

it('quotes voice design by the explicit sample text and accepts native catalog voice ids',()=>{
 const sample='Exemplo de narração sintética. '.repeat(5);
 const input=parseStudioInput({operation:'voice_design',description:'Narrador adulto fictício com voz clara e ritmo natural.',sample_text:sample});
 expect(studioInputUnits(input)).toEqual({characters:sample.trim().length});
 expect(parseStudioInput({operation:'gemini_tts',voice_id:'gemini:kore',text:'Olá.'}).voice_id).toBe('gemini:kore');
 expect(()=>parseStudioInput({operation:'gemini_tts',voice_id:'Kore',text:'Olá.'})).toThrow();
});

it('accepts explicit model ids with version dots sent by the Studio and rejects other models',()=>{
 for(const model_id of ['gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts']){
  expect(parseStudioInput({operation:'gemini_tts',model_id,voice_id:'gemini:kore',text:'Teste.'})).toMatchObject({model_id});
 }
 for(const model_id of ['../../other','gemini-new','https://example.com'])expect(()=>parseStudioInput({operation:'gemini_tts',model_id,voice_id:'gemini:kore',text:'Teste.'})).toThrow();
});
