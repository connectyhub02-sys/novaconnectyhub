import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {VoiceAuth} from '../src/lib/voice-api/auth';
import type * as Editor from '../src/lib/voice-api/studio-editor';
import {serverModuleHarness} from './helpers/server-module-harness';
import {VoiceError,voiceBody} from '../src/lib/voice-api/contract';
import {parseVoiceSettings} from '../src/lib/voice-api/studio-contract';

const editorModule=serverModuleHarness<typeof Editor>('src/lib/voice-api/studio-editor.ts',{
  './contract':{VoiceError,voiceBody},'./studio-contract':{parseVoiceSettings},
  './generations':{publicVoiceGeneration:(row:unknown)=>row},
},[],{TextDecoder});
function fixture(rows:Record<string,unknown>[]){
  const calls:unknown[][]=[];
  const client={from:(table:string)=>{
    calls.push(['from',table]);let filtered=rows;
    const query={
      select:()=>query,order:()=>query,limit:()=>query,in:()=>query,
      eq:(key:string,value:unknown)=>{calls.push(['eq',key,value]);filtered=filtered.filter(r=>r[key]===value);return query;},
      ilike:(key:string,value:unknown)=>{calls.push(['ilike',key,value]);return query;},
      gte:()=>query,or:(value:string)=>{calls.push(['or',value]);return query;},
      update:()=>query,insert:()=>query,
      maybeSingle:async()=>({data:filtered[0]??null,error:null}),
      then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:filtered,error:null}).then(resolve),
    };return query;
  }};
  return {calls,auth:{client,project:{id:'project-a',organization_id:'org-a'},userId:'user-a',studio:true} as unknown as VoiceAuth};
}
it('draft reads are scoped to authenticated user, project and organization, ignoring URL ownership',async()=>{
  const f=fixture([{project_id:'project-b',organization_id:'org-a',user_id:'user-a',script:{text:'private'}}]);
  const result=await editorModule.studioDraft(f.auth,new Request('https://example.test/draft?project=project-b&user=user-b'));
  expect(result).toEqual({draft:null});
  expect(f.calls).toContainEqual(['eq','project_id','project-a']);expect(f.calls).toContainEqual(['eq','organization_id','org-a']);expect(f.calls).toContainEqual(['eq','user_id','user-a']);
});
it('public API keys cannot access personal drafts',async()=>{
  const f=fixture([]);f.auth.studio=false;
  await expect(editorModule.studioDraft(f.auth,new Request('https://example.test'))).rejects.toMatchObject({status:401});expect(f.calls).toEqual([]);
});
it('cursor and search are validated before querying history across tenant boundaries',async()=>{
  const f=fixture([]);
  await expect(editorModule.studioHistoryPage(f.auth,new Request('https://example.test/history?cursor=bad.or.filter'))).rejects.toMatchObject({status:422});
  await editorModule.studioHistoryPage(f.auth,new Request('https://example.test/history?search=100%25'));
  expect(f.calls).toContainEqual(['eq','organization_id','org-a']);expect(f.calls).toContainEqual(['eq','project_id','project-a']);
  expect(f.calls).toContainEqual(['ilike','studio_script->>text','%100\\%%']);
});
it('conflicting draft writes do not overwrite a newer version',async()=>{
  const f=fixture([{project_id:'project-a',organization_id:'org-a',user_id:'user-a',version:2}]);
  const request=new Request('https://example.test/draft',{method:'POST',body:JSON.stringify({version:1,script:{text:'new',voice_id:'v',model_id:'eleven_v3'}})});
  await expect(editorModule.studioDraft(f.auth,request)).rejects.toMatchObject({status:409,code:'draft_conflict'});
  expect(f.calls).toContainEqual(['eq','version',1]);
});

