import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptCredentialValue } from '@/lib/security/credentials-crypto';
import { changeSocialConnection } from './connections';
import type { SocialTokens } from './providers';
import type { SocialProvider } from './policy';
import { validateCreator,type CreatorInfo,type SocialDraft } from './publishing-policy';
import { socialVideoBytes,type socialMedia } from './media';
import { loadMetaOrganicCredentials,sendMetaOrganicGraphRequest } from '@/lib/meta/organic-publishing';
import { advanceOrganicDelivery,OrganicGraphRejected,type OrganicDelivery } from '@/lib/meta/organic-publishing-runner';
import { metaFeatureLaunchPaused } from '@/lib/meta/launch-status';

export type Progress = {phase?:string;publishId?:string;session?:string;videoId?:string;offset?:number;meta?:OrganicDelivery;creatorUsername?:string;previousIds?:string[]};
export type Delivery = {id:string;organization_id:string;post_id:string;target:'youtube'|'tiktok'|'facebook'|'instagram';account_id:string;connection_id:string|null;progress:Progress;lease_id:string;attempts:number;created_at:string};
export class PublishError extends Error {constructor(message:string,public retryable=false,public restartSafe=false){super(message);}}
export async function socialToken(client:SupabaseClient,org:string,provider:SocialProvider,connectionId?:string|null,accountId?:string){
 let row=await client.from('social_connections').select('*').eq('organization_id',org).eq('provider',provider).single();
 if(row.data?.status==='checking')throw new PublishError('A conta está sendo verificada. O envio aguardará a conclusão.',true);
 const valid=()=>!row.error&&row.data?.status==='connected'&&row.data.selected_account_id&&(!connectionId||row.data.id===connectionId)&&(!accountId||row.data.selected_account_id===accountId);
 if(!valid())throw new PublishError('Conecte e selecione novamente a conta original em Contas conectadas.');
 let tokens=JSON.parse(decryptCredentialValue(row.data.encrypted_tokens)) as SocialTokens;
 if(tokens.expiresAt<Date.now()+120000){
  await changeSocialConnection(client,org,provider,'check');
  row=await client.from('social_connections').select('*').eq('organization_id',org).eq('provider',provider).single();
  if(!valid())throw new PublishError('A conexão mudou durante a renovação. Revise a conta.');
  tokens=JSON.parse(decryptCredentialValue(row.data.encrypted_tokens));
 }
 return {token:tokens.accessToken,accountId:row.data.selected_account_id as string,connectionId:row.data.id as string};
}
async function tiktokCall(token:string,path:string,body:unknown){
 const response=await fetch(`https://open.tiktokapis.com/v2/post/publish/${path}/`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000),cache:'no-store'});
 const data=await response.json().catch(()=>null);
 if(!response.ok||data?.error?.code!=='ok'){
  const code=typeof data?.error?.code==='string'?data.error.code.replace(/[^a-zA-Z0-9_]/g,'').slice(0,90):`http_${response.status}`;
  if(response.status>=500)throw Error('TikTok indisponível; o recebimento precisa ser conferido.');
  throw new PublishError(`TikTok: ${code}. Confira a conexão e os limites desta conta.`,response.status===429);
 }
 return data.data;
}
export async function creatorInfo(token:string):Promise<CreatorInfo>{
 const info=await tiktokCall(token,'creator_info/query',{});
 if(!Array.isArray(info?.privacy_level_options)||!Number.isFinite(info?.max_video_post_duration_sec))throw new PublishError('O TikTok não retornou as opções atuais de publicação.');return info;
}
function sessionUrl(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.googleapis.com'||!u.pathname.startsWith('/upload/youtube/')||u.username||u.password)throw Error('Sessão de upload inválida.');return u.toString();}
async function youtubeResponse(r:Response){
 const data=await r.json().catch(()=>null);
 if(!r.ok){const code=String(data?.error?.errors?.[0]?.reason??`http_${r.status}`).replace(/[^a-zA-Z0-9_]/g,'').slice(0,90);throw new PublishError(`YouTube: ${code}. Confira a autorização ou a cota do projeto.`,r.status===429||r.status>=500||code==='quotaExceeded');}return data;
}
export async function advanceSocialDelivery(input:{client:SupabaseClient;delivery:Delivery;draft:SocialDraft;media:Awaited<ReturnType<typeof socialMedia>>;save:(progress:Progress)=>Promise<void>}){
 const {client,delivery:d,draft,media,save}=input,p=d.progress;
 const caption=draft.captions[d.target]??draft.caption;
 if(d.target==='tiktok'){
  const {token}=await socialToken(client,d.organization_id,'tiktok',d.connection_id,d.account_id);
  if(p.publishId){
   const status=await tiktokCall(token,'status/fetch',{publish_id:p.publishId});
   if(status.status==='FAILED')throw new PublishError(`TikTok não publicou: ${String(status.fail_reason??'falha').replace(/[^a-zA-Z0-9_]/g,'').slice(0,90)}. Revise antes de tentar novamente.`,false,true);
   if(status.status==='PUBLISH_COMPLETE'){const id=String(status.publicaly_available_post_id?.[0]??'');return {done:true,id:id||p.publishId,url:id&&p.creatorUsername?`https://www.tiktok.com/@${encodeURIComponent(p.creatorUsername)}/video/${encodeURIComponent(id)}`:null};}
   return {done:false};
  }
  if(p.phase==='sending')throw Error('Recebimento no TikTok incerto. Confira a conta antes de qualquer novo envio.');
  const info=await creatorInfo(token);validateCreator(draft,info,media.check!);
  p.phase='sending';p.creatorUsername=info.creator_username;await save(p);
  try{
   const result=await tiktokCall(token,'video/init',{post_info:{title:caption,privacy_level:draft.tiktok.privacy,disable_comment:!draft.tiktok.comments,disable_duet:!draft.tiktok.duet,disable_stitch:!draft.tiktok.stitch,brand_organic_toggle:draft.tiktok.ownBrand,brand_content_toggle:draft.tiktok.branded},source_info:{source:'PULL_FROM_URL',video_url:media.url}});
   if(!result?.publish_id)throw Error('TikTok não retornou o identificador do envio.');
   p.publishId=result.publish_id;p.phase='processing';await save(p);return {done:false};
  }catch(error){if(error instanceof PublishError){p.phase='ready';await save(p);}throw error;}
 }
 if(d.target==='youtube'){
  const {token}=await socialToken(client,d.organization_id,'youtube',d.connection_id,d.account_id);
  const headers={Authorization:`Bearer ${token}`};
  if(p.videoId){
   const result=await youtubeResponse(await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(p.videoId)}`,{headers,redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'}));
   const video=result.items?.[0];if(!video)throw new PublishError('O vídeo enviado não foi localizado no canal. Confira no YouTube.');
   if(['failed','rejected','deleted'].includes(video.status?.uploadStatus)||['failed','terminated'].includes(video.processingDetails?.processingStatus))throw new PublishError('O YouTube recusou ou interrompeu o processamento do vídeo.',false,true);
   if(video.status?.uploadStatus==='processed'||video.processingDetails?.processingStatus==='succeeded')return {done:true,id:p.videoId,url:`https://www.youtube.com/watch?v=${encodeURIComponent(p.videoId)}`};
   return {done:false};
  }
  if(!p.session){
   // A regular OAuth token uploads to its own channel; never pretend a channelId in the snippet selects a different channel.
   const channels=await youtubeResponse(await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers,redirect:'error',signal:AbortSignal.timeout(20000)}));
   if(channels.items?.length!==1||channels.items[0].id!==d.account_id)throw new PublishError('Autorize especificamente o canal de destino do YouTube.');
   const r=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':String(media.size)},body:JSON.stringify({snippet:{title:draft.title,description:caption,categoryId:'22'},status:{privacyStatus:draft.youtube.privacy,selfDeclaredMadeForKids:draft.youtube.madeForKids,containsSyntheticMedia:draft.youtube.synthetic}}),redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!r.ok)await youtubeResponse(r);
   const location=r.headers.get('location');if(!location)throw new PublishError('Não foi possível iniciar a sessão do YouTube.',true);
   p.session=sessionUrl(location);p.offset=0;p.phase='uploading';await save(p);
  }
  // Reconcile with the server before every chunk, including after a process crash or timeout.
  const status=await fetch(sessionUrl(p.session),{method:'PUT',headers:{...headers,'Content-Range':`bytes */${media.size}`,'Content-Length':'0'},body:new Uint8Array(),redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(status.ok){const data=await status.json();if(!data.id)throw Error('O YouTube não retornou o vídeo.');p.videoId=data.id;p.phase='processing';await save(p);return {done:false};}
  if(status.status!==308){if([404,410].includes(status.status))throw Error('A sessão do YouTube expirou. Confira o canal antes de iniciar outro envio.');await youtubeResponse(status);}
  const range=status.headers.get('range'),offset=range?Number(/^bytes=0-(\d+)$/.exec(range)?.[1])+1:0;
  if(!Number.isInteger(offset)||offset<0||offset>=media.size)throw Error('O progresso do YouTube precisa de conferência.');
  const bytes=await socialVideoBytes(media),deadline=Date.now()+120000;
  let next=offset;
  while(next<bytes.length){
   const end=Math.min(next+8*1024*1024,bytes.length);
   const r=await fetch(sessionUrl(p.session),{method:'PUT',headers:{...headers,'Content-Type':'video/mp4','Content-Range':`bytes ${next}-${end-1}/${bytes.length}`,'Content-Length':String(end-next)},body:new Uint8Array(bytes.subarray(next,end)),redirect:'manual',signal:AbortSignal.timeout(90000)});
   if(r.status===308){
    const accepted=r.headers.get('range');next=accepted?Number(/^bytes=0-(\d+)$/.exec(accepted)?.[1])+1:end;
    if(!Number.isInteger(next)||next<=p.offset!||next>bytes.length)throw Error('O progresso do YouTube exige conferência.');
    p.offset=next;await save(p);if(Date.now()>deadline)return {done:false};continue;
   }
   const result=await youtubeResponse(r);if(!result.id)throw Error('O resultado do envio exige conferência.');p.videoId=result.id;p.phase='processing';await save(p);return {done:false};
  }
  return {done:false};
 }
 if(metaFeatureLaunchPaused)throw new PublishError('A publicação Meta ainda está aguardando liberação.');
 const credentials=await loadMetaOrganicCredentials(client,d.organization_id),surface=d.target==='facebook'?'facebook_page':'instagram_feed';
 if(d.account_id!==(d.target==='facebook'?credentials.pageId:credentials.instagramBusinessId))throw new PublishError('O ativo Meta mudou. Reconecte a conta original.');
 const graph=async (s:'facebook_page'|'instagram_feed',path:string,body:Record<string,string>,method:'GET'|'POST'='POST')=>{
  const token=s==='facebook_page'?credentials.pageAccessToken:credentials.accessToken;if(!token)throw new PublishError('Reconecte a conta Meta.');
  const r=await sendMetaOrganicGraphRequest({credentials,token,endpointPath:path,body,method});
  if(!r.ok){if(r.httpStatus>=500)throw Error('Meta indisponível; confira o recebimento.');throw new OrganicGraphRejected(`Meta recusou a operação (HTTP ${r.httpStatus}). Verifique permissões e formato.`);}return r.data as Record<string,unknown>;
 };
 p.meta??={surface,accountId:d.account_id,phase:'preparing',children:[]};
 const done=await advanceOrganicDelivery({delivery:p.meta,format:'reel',media:[{url:media.url,type:'video'}],caption,graph,save:()=>save(p),upload:async(url,fileUrl)=>{
  const target=new URL(url);if(target.protocol!=='https:'||target.hostname!=='rupload.facebook.com'||target.username||target.password)throw Error('Upload Meta inválido.');
  const r=await fetch(target,{method:'POST',headers:{Authorization:`OAuth ${credentials.pageAccessToken}`,file_url:fileUrl},redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!r.ok||(await r.json()).success!==true)throw Error('O recebimento do vídeo pela Meta não foi confirmado.');
 }}).catch(error=>{if(error instanceof OrganicGraphRejected)throw new PublishError(error.message);throw error;});
 let url:string|null=null;
 if(done&&p.meta.id){if(d.target==='facebook')url=`https://www.facebook.com/${encodeURIComponent(p.meta.id)}`;else{const item=await graph(surface,`/${p.meta.id}`,{fields:'permalink'},'GET').catch(()=>null);if(typeof item?.permalink==='string'&&item.permalink.startsWith('https://www.instagram.com/'))url=item.permalink;}}
 return {done,id:p.meta.id,url};
}
