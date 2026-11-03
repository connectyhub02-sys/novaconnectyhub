import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { assertOrganicPublishingAccess } from '@/lib/meta/organic-publishing-access';
import { assertContractAccess } from '@/lib/billing/contract-access';
import { loadMetaOrganicCredentials } from '@/lib/meta/organic-publishing';
import { metaFeatureLaunchPaused } from '@/lib/meta/launch-status';
import { runCreativeJob,creativeTariffs } from '@/lib/meta/creative-studio';
import { parseCreativeBrief } from '@/lib/meta/creative-policy';
import { parseSocialDraft,targets,validateCreator,videoBlocks } from './publishing-policy';
import { socialMedia,checkStoredVideo } from './media';
import { socialToken,creatorInfo,advanceSocialDelivery,PublishError,type Delivery,type Progress } from './publishers';

const deliveryFields='id,post_id,target,status,account_id,provider_id,result_url,error_message,updated_at,next_attempt_at,api_data_deleted_at';
export async function publishingOverview(client:SupabaseClient,org:string){
 const [posts,deliveries,media,analyses,tariffs]=await Promise.all([
  client.from('social_posts').select('id,revision,draft,state,scheduled_for,timezone,approved_at,created_at').eq('organization_id',org).order('created_at',{ascending:false}).limit(100),
  client.from('social_deliveries').select(deliveryFields).eq('organization_id',org).order('created_at',{ascending:false}).limit(400),
  client.from('content_pipeline_items').select('id,title,metadata,created_at').eq('organization_id',org).eq('scope','organization').eq('content_type','meta_organic_media').contains('metadata',{content_type:'video/mp4'}).order('created_at',{ascending:false}).limit(100),
  client.from('meta_creative_jobs').select('id,status,result,charge_credits,error_message,brief').eq('organization_id',org).eq('mode','analysis').order('created_at',{ascending:false}).limit(100),
  creativeTariffs(client,org).catch(()=>null),
 ]);
 if(posts.error||deliveries.error||media.error||analyses.error)throw Error('Não foi possível carregar a área de publicação. Verifique a preparação do banco.');
 return {posts:posts.data,deliveries:deliveries.data,media:media.data.map(m=>({id:m.id,title:m.title,url:m.metadata?.storage_url,check:m.metadata?.social_video_check??null})),analyses:analyses.data.filter(a=>a.brief?.socialPlatforms?.length),tariff:tariffs?.find(t=>t.feature==='media_video_analysis')??null,metaPaused:metaFeatureLaunchPaused};
}
export async function saveSocialDraft(client:SupabaseClient,org:string,user:string,raw:unknown,id?:string,revision?:number){
 const draft=parseSocialDraft(raw);await socialMedia(client,org,draft.mediaId);
 if(id){
  if(!Number.isInteger(revision))throw Error('Atualize a versão do rascunho.');
  const r=await client.from('social_posts').update({draft,revision:revision!+1,timezone:draft.timezone,approved_at:null,approved_by:null,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',id).eq('revision',revision!).eq('state','draft').select('id,revision').maybeSingle();
  if(r.error||!r.data)throw Error('O rascunho mudou ou já foi aprovado. Atualize a página.');return r.data;
 }
 const r=await client.from('social_posts').insert({id:randomUUID(),organization_id:org,created_by:user,draft,timezone:draft.timezone}).select('id,revision').single();
 if(r.error)throw Error('Não foi possível salvar o rascunho.');return r.data;
}
export async function reviewSocialDestinations(client:SupabaseClient,org:string,id:string){
 const post=await client.from('social_posts').select('draft,state').eq('organization_id',org).eq('id',id).single();
 if(post.error||post.data.state!=='draft')throw Error('Selecione um rascunho desta empresa.');
 const draft=parseSocialDraft(post.data.draft),results=[];
 for(const target of draft.targets){
  if(target==='youtube'||target==='tiktok'){
   const r=await client.from('social_connections').select('id,status,accounts,selected_account_id').eq('organization_id',org).eq('provider',target).single();
   const account=r.data?.accounts?.find((a:{id:string})=>a.id===r.data?.selected_account_id);
   if(r.error||r.data.status!=='connected'||!account)throw Error(`Selecione a conta ${target} em Contas conectadas.`);
   results.push({target,accountId:account.id as string,connectionId:r.data.id as string,label:account.name as string});
  }else{const config=await loadMetaOrganicCredentials(client,org),accountId=target==='facebook'?config.pageId:config.instagramBusinessId;if(!accountId)throw Error('Selecione os ativos Meta.');results.push({target,accountId,connectionId:null,label:`${target} · ${accountId}`});}
 }return results;
}
export async function approveSocialPost(client:SupabaseClient,org:string,user:string,id:string,revision:number,when:unknown,reviewed:unknown){
 await assertOrganicPublishingAccess(client,org);await assertContractAccess(org,client);
 const post=await client.from('social_posts').select('draft,revision,state').eq('organization_id',org).eq('id',id).single();
 if(post.error||post.data.state!=='draft'||post.data.revision!==revision)throw Error('O rascunho mudou. Confira antes de aprovar.');
 const draft=parseSocialDraft(post.data.draft),check=await checkStoredVideo(client,org,draft.mediaId);
 let scheduled:string|null=null;
 if(when){if(typeof when!=='string'||!Number.isFinite(Date.parse(when))||Date.parse(when)<Date.now()+60000||Date.parse(when)>Date.now()+28*86400000)throw Error('Agende entre um minuto e 28 dias no futuro.');scheduled=new Date(when).toISOString();}
 const deliveries=[];
 const expected=await reviewSocialDestinations(client,org,id);
 if(!Array.isArray(reviewed)||expected.length!==reviewed.length||expected.some(e=>!reviewed.some(r=>r.target===e.target&&r.accountId===e.accountId&&r.connectionId===e.connectionId)))throw Error('As contas de destino mudaram. Revise novamente.');
 for(const target of draft.targets){
  const blocks=videoBlocks(check,target);if(blocks.length)throw Error(blocks.join(' '));
  if(target==='youtube'||target==='tiktok'){
   const connection=await socialToken(client,org,target);
   if(!expected.some(e=>e.target===target&&e.accountId===connection.accountId&&e.connectionId===connection.connectionId))throw Error('A conta mudou durante a revisão. Confira novamente.');
   if(target==='tiktok'){if(draft.tiktok.accountId!==connection.accountId)throw Error('Carregue as opções atuais e confirme a conta TikTok.');validateCreator(draft,await creatorInfo(connection.token),check);}
   deliveries.push({target,accountId:connection.accountId,connectionId:connection.connectionId});
  }else{
   if(metaFeatureLaunchPaused)throw Error('A publicação Meta ainda aguarda liberação. Desmarque as redes Meta para testar as demais.');
   const config=await loadMetaOrganicCredentials(client,org),accountId=target==='facebook'?config.pageId:config.instagramBusinessId;
   if(!accountId)throw Error('Selecione a Página e o Instagram em Contas conectadas.');
   if(!expected.some(e=>e.target===target&&e.accountId===accountId))throw Error('O ativo Meta mudou durante a revisão.');deliveries.push({target,accountId});
  }
 }
 const result=await client.rpc('approve_social_post',{p_org:org,p_id:id,p_revision:revision,p_actor:user,p_deliveries:deliveries,p_when:scheduled});
 if(result.error)throw Error('A publicação mudou ou já foi aprovada. Atualize o histórico.');
 return {message:scheduled?'Publicação agendada.':'Publicação aprovada e colocada na fila.'};
}
export async function analyzeSocialVideo(client:SupabaseClient,org:string,user:string,mediaId:string){
 await checkStoredVideo(client,org,mediaId);
 // The same file uses the same request identity across all four platforms and across retries.
 const brief={...parseCreativeBrief({mode:'analysis',mediaId,prompt:'Avalie este vídeo para publicação orgânica em Instagram Reels, Facebook Reels, TikTok e YouTube. Não crie roteiro.',goal:'Publicação orgânica multiplataforma'}),socialPlatforms:[...targets]};
 const existing=await client.from('meta_creative_jobs').select('id').eq('organization_id',org).eq('mode','analysis').contains('brief',{mediaId,socialPlatforms:[...targets]}).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(existing.error)throw Error('Não foi possível consultar as análises existentes.');
 // A deterministic UUID serializes concurrent requests, even from separate browser tabs.
 const {createHash}=await import('node:crypto');const h=createHash('sha256').update(`${org}:${mediaId}:social-video-v1`).digest('hex');
 const id=existing.data?.id??`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
 await runCreativeJob(client,org,user,id,brief);return {message:'Análise disponível no diagnóstico do vídeo.'};
}
export async function processSocialDeliveries(){
 const client=createServiceClient();
 const claimed=await client.rpc('claim_social_deliveries',{p_limit:4});
 if(claimed.error)throw Error('Fila social indisponível.');
 return Promise.all(((claimed.data??[]) as Delivery[]).map(async d=>{
  const save=async(progress:Progress,extra:Record<string,unknown>={})=>{
   const r=await client.from('social_deliveries').update({progress,updated_at:new Date().toISOString(),...extra}).eq('organization_id',d.organization_id).eq('id',d.id).eq('lease_id',d.lease_id).eq('status','processing').select('id').maybeSingle();
   if(r.error||!r.data)throw Error('Não foi possível registrar o progresso.');
  };
  try{
   await assertOrganicPublishingAccess(client,d.organization_id);await assertContractAccess(d.organization_id,client);
   const post=await client.from('social_posts').select('draft,state').eq('id',d.post_id).eq('organization_id',d.organization_id).single();
   if(post.error||post.data.state!=='approved')throw new PublishError('A publicação não está aprovada.');
   const draft=parseSocialDraft(post.data.draft),media=await socialMedia(client,d.organization_id,draft.mediaId);
   if(!media.check||videoBlocks(media.check,d.target).length)throw new PublishError('O vídeo exige nova validação técnica.');
   if(Date.now()-Date.parse(d.created_at)>100*86400000||d.attempts>200)throw Error('O acompanhamento excedeu o limite. Confira o resultado na plataforma.');
   const result=await advanceSocialDelivery({client,delivery:d,draft,media,save});
   await save(d.progress,{status:result.done?'published':'processing',provider_id:result.id??null,result_url:result.url??null,error_message:null,lease_id:null,lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()});
   return {id:d.id,status:result.done?'published':'processing'};
  }catch(error){
   if(error instanceof PublishError&&error.restartSafe)d.progress={phase:'ready',previousIds:[...(d.progress.previousIds??[]),d.progress.publishId??d.progress.videoId??''].filter(Boolean)};
   const uncertain=d.progress.phase==='sending'||d.progress.meta?.phase==='sending';
   const resumable=Boolean(d.progress.session||d.progress.publishId||d.progress.videoId||(d.progress.meta&&d.progress.meta.phase!=='sending'));
   const retry=!uncertain&&d.attempts<200&&(error instanceof PublishError?error.retryable:resumable);
   const status=uncertain?'uncertain':retry?'processing':'failed';
   const message=error instanceof Error?error.message:'Não foi possível concluir o envio.';
   await save(d.progress,{status,error_message:message.slice(0,500),lease_id:null,lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(d.attempts,6))).toISOString()});
   return {id:d.id,status};
  }
 }));
}
