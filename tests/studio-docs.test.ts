import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {voiceOpenApiSpec} from '../src/lib/voice-api/openapi';
import {studioSchemas,studioPaths,studioGuide} from '../src/lib/voice-api/studio-openapi';
import {parseStudioInput,studioDefinitions} from '../src/lib/voice-api/studio-contract';
it('resolves public Studio schemas and keeps a unique operation ID per endpoint',()=>{
 const spec=JSON.parse(JSON.stringify(voiceOpenApiSpec)),ids:string[]=[];
 function walk(value:unknown){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){
  if(key==='$ref')expect(String(child).slice(2).split('/').reduce((v,k)=>v?.[k],spec),String(child)).toBeDefined();
  else if(key==='operationId')ids.push(String(child));else walk(child);
 }}walk(spec);expect(new Set(ids).size).toBe(ids.length);expect(ids).toContain('deleteStudioResult');
 expect(studioGuide).toContain('available=true');expect(studioGuide).toContain('X-Max-Credits');
 expect(JSON.stringify(studioPaths)).not.toMatch(/providerCostPerUnit|confirmed_rates|xi-api-key/);
});
it('documents every accepted operation with strict request fields and valid examples',()=>{
 expect(studioSchemas.StudioInput.oneOf.map(s=>(s.properties.operation as {const:string}).const).sort()).toEqual(Object.keys(studioDefinitions).sort());
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const examples=[{operation:'transcription',asset_id:id},{operation:'audio_isolation',asset_id:id},{operation:'voice_change',asset_id:id,voice_id:'test_voice'},
 {operation:'forced_alignment',asset_id:id,text:'Teste sintético'},{operation:'dubbing',asset_id:id,target_language:'en'},
 {operation:'gemini_tts',voice_id:'gemini:kore',text:'Teste sintético'},{operation:'dialogue',turns:[{text:'Olá',voice_id:'test_voice'}]},
 {operation:'voice_design',description:'Uma voz calma para leitura de notícias.',sample_text:'Este texto é um exemplo sintético usado para conferir o contrato de geração sem executar nenhuma operação externa.'},
 {operation:'voice_design_save',preview_id:id,name:'Voz teste',description:'Uma voz calma para leitura de notícias.'},
 {operation:'dictionary_create',name:'Dicionário teste',rules:[{type:'alias',string_to_replace:'CH',alias:'ConnectyHub'}]}];
 for(const example of examples){expect(()=>parseStudioInput(example)).not.toThrow();const schema=studioSchemas.StudioInput.oneOf.find(s=>(s.properties.operation as {const:string}).const===example.operation)!;expect(schema.additionalProperties).toBe(false);for(const key of schema.required)expect(example).toHaveProperty(key);}
});
