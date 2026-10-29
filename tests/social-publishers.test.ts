import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/security/credentials-crypto',()=>({decryptCredentialValue:(s:string)=>s}));
vi.mock('@/lib/social/connections',()=>({changeSocialConnection:vi.fn()}));
vi.mock('@/lib/social/media',()=>({socialVideoBytes:async()=>Buffer.alloc(20)}));
vi.mock('@/lib/meta/organic-publishing',()=>({loadMetaOrganicCredentials:vi.fn(),sendMetaOrganicGraphRequest:vi.fn()}));
vi.mock('@/lib/meta/launch-status',()=>({metaFeatureLaunchPaused:false}));
import {advanceSocialDelivery,type Delivery,type Progress} from '@/lib/social/publishers';
import {parseSocialDraft,type VideoCheck} from '@/lib/social/publishing-policy';
const fetcher=vi.fn();
beforeEach(()=>{vi.stubGlobal('fetch',fetcher);fetcher.mockReset();});
const draft=parseSocialDraft({mediaId:'11111111-1111-4111-8111-111111111111',title:'Vídeo',caption:'Legenda',targets:['youtube'],timezone:'America/Sao_Paulo',youtube:{privacy:'private',madeForKids:false,synthetic:false},tiktok:{privacy:'SELF_ONLY',comments:false,duet:false,stitch:false,ownBrand:false,branded:false,consent:true}});
const check:VideoCheck={version:1,duration:30,width:1080,height:1920,fps:30,videoCodec:'h264',audioCodec:'aac',sha256:'hash',warnings:[]};
const media={id:draft.mediaId,title:'Video',metadata:{},url:'https://media.example.com/owned.mp4',size:20,check};
function args(target:'youtube'|'tiktok',progress:Progress={}){
 const data={id:'connection',status:'connected',selected_account_id:'account',encrypted_tokens:JSON.stringify({accessToken:'private-token',expiresAt:Date.now()+999999})};
 const query={select:()=>query,eq:()=>query,single:async()=>({data,error:null})};
 const delivery={id:'delivery',organization_id:'org',post_id:'post',target,account_id:'account',connection_id:'connection',progress,lease_id:'lease',attempts:1,created_at:new Date().toISOString()} satisfies Delivery;
 const save=vi.fn(async()=>{});
 return {client:{from:()=>query} as never,delivery,draft,media,save};
}
const response=(body:unknown,status=200,headers?:Record<string,string>)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
it('checkpoints TikTok before sending and never repeats an uncertain init',async()=>{
 const a=args('tiktok');fetcher.mockResolvedValueOnce(response({error:{code:'ok'},data:{privacy_level_options:['SELF_ONLY'],max_video_post_duration_sec:60}})).mockRejectedValueOnce(Error('network interrupted'));
 await expect(advanceSocialDelivery(a)).rejects.toThrow('network');expect(a.delivery.progress.phase).toBe('sending');expect(a.save).toHaveBeenCalled();fetcher.mockClear();await expect(advanceSocialDelivery(a)).rejects.toThrow('incerto');expect(fetcher).not.toHaveBeenCalled();
});
it('polls a recorded TikTok id without creating another post',async()=>{const a=args('tiktok',{publishId:'p',phase:'processing'});fetcher.mockResolvedValue(response({error:{code:'ok'},data:{status:'PUBLISH_COMPLETE',publicaly_available_post_id:[]}}));expect(await advanceSocialDelivery(a)).toMatchObject({done:true,id:'p',url:null});expect(fetcher.mock.calls[0][0]).toContain('status/fetch');});
it('resumes YouTube at the server offset after interruption',async()=>{const a=args('youtube',{session:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=secret',offset:0,phase:'uploading'});fetcher.mockResolvedValueOnce(response(null,308,{range:'bytes=0-9'})).mockResolvedValueOnce(response({id:'video'}));expect(await advanceSocialDelivery(a)).toMatchObject({done:false});expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][1].headers['Content-Range']).toBe('bytes 10-19/20');expect(a.delivery.progress.videoId).toBe('video');});
it('recovers a completed upload response without resending bytes',async()=>{const a=args('youtube',{session:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=secret',phase:'uploading'});fetcher.mockResolvedValueOnce(response({id:'existing'}));await advanceSocialDelivery(a);expect(fetcher).toHaveBeenCalledTimes(1);expect(a.delivery.progress.videoId).toBe('existing');});
it('does not send bearer credentials to an untrusted upload location',async()=>{const a=args('youtube',{session:'https://attacker.example/upload',phase:'uploading'});await expect(advanceSocialDelivery(a)).rejects.toThrow('inválida');expect(fetcher).not.toHaveBeenCalled();});
it('does not report uploaded YouTube videos as published until processing completes',async()=>{const a=args('youtube',{videoId:'video',phase:'processing'});fetcher.mockResolvedValueOnce(response({items:[{status:{uploadStatus:'uploaded'},processingDetails:{processingStatus:'processing'}}]}));expect(await advanceSocialDelivery(a)).toEqual({done:false});});
