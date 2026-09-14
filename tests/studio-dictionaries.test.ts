import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {parseDictionaryIds,resolveStudioDictionaries} from '../src/lib/voice-api/studio-dictionaries';
import {parseVoiceInput} from '../src/lib/voice-api/contract';
import type {VoiceAuth} from '../src/lib/voice-api/auth';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
afterEach(()=>vi.unstubAllEnvs());
function fixture(rows:unknown[],error:unknown=null){
 const q={select:vi.fn(),in:vi.fn(),eq:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:rows,error}).then(resolve)};
 q.select.mockReturnValue(q);q.in.mockReturnValue(q);q.eq.mockReturnValue(q);
 const client={from:vi.fn(()=>q)};
 const auth={client,project:{id:'project-a',organization_id:'org-a'}} as unknown as VoiceAuth;
 return {q,client,auth};
}
it('keeps legacy input unchanged and rejects provider IDs or duplicate dictionaries',()=>{
 const input={text:'Olá',voice_id:'voice'};
 expect(parseVoiceInput(input)).not.toHaveProperty('dictionary_ids');
 expect(parseVoiceInput({...input,dictionary_ids:[]})).toEqual(parseVoiceInput(input));
 expect(parseVoiceInput({...input,dictionary_ids:[a]})).toHaveProperty('dictionary_ids',[a]);
 for(const ids of [[a,a],['provider-id'],[a,b,a,b],null])expect(()=>parseDictionaryIds(ids)).toThrow();
});
it('requires owned completed resources and preserves caller precedence, not database order',async()=>{
 vi.stubEnv('STUDIO_OPERATIONS_ENABLED','true');
 const {auth,q}=fixture([{id:b,provider_id:'dictB',provider_version:'v2'},{id:a,provider_id:'dictA',provider_version:'v1'}]);
 await expect(resolveStudioDictionaries(auth,[a,b])).resolves.toEqual([{pronunciation_dictionary_id:'dictA',version_id:'v1'},{pronunciation_dictionary_id:'dictB',version_id:'v2'}]);
 for(const pair of [['project_id','project-a'],['organization_id','org-a'],['kind','dictionary'],['status','ready'],['studio_operations.voice_generations.status','completed']])expect(q.eq).toHaveBeenCalledWith(...pair);
});
it('fails closed for resources missing from the scoped query and invalid provider versions',async()=>{
 vi.stubEnv('STUDIO_OPERATIONS_ENABLED','true');
 await expect(resolveStudioDictionaries(fixture([]).auth,[a])).rejects.toMatchObject({status:404});
 await expect(resolveStudioDictionaries(fixture([{id:a,provider_id:'dict',provider_version:'../other'}]).auth,[a])).rejects.toMatchObject({status:404});
 await expect(resolveStudioDictionaries(fixture([],{message:'unavailable'}).auth,[a])).rejects.toMatchObject({status:503});
});
it('does not access resources for ordinary TTS or disabled dictionaries',async()=>{
 const {auth,client}=fixture([]);vi.stubEnv('STUDIO_OPERATIONS_ENABLED','false');
 await expect(resolveStudioDictionaries(auth,[])).resolves.toEqual([]);
 await expect(resolveStudioDictionaries(auth,[a])).rejects.toMatchObject({code:'dictionary_unavailable'});
 expect(client.from).not.toHaveBeenCalled();
});
