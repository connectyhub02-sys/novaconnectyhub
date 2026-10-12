import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adsLeadsGraph, loadAdsLeadsContext, requireMetaScopes, metaRecord, selectedMetaAsset, MetaGraphError, type AdsLeadsContext } from "./ads-leads-context";
import { campaignSettings, executionSnapshot, campaignPayload, adSetPayload, assertBudgetApproval, type CampaignSnapshot } from "./campaign-policy";
import { loadR2Config, buildPublicObjectUrl } from "@/lib/storage/r2";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { creativeMediaIds, type CreativeReport } from "./creative-policy";

type Execution = { id: string; proposal_id: string; status: string; snapshot: CampaignSnapshot; snapshot_hash: string; remote_ids: Record<string, string>; remote_fingerprint: string | null; start_at: string | null; end_at: string | null; error_message: string | null; activation_approval: unknown };
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const fields = "id,proposal_id,status,snapshot,snapshot_hash,remote_ids,remote_fingerprint,start_at,end_at,error_message,activation_approval";
export async function campaignHistory(client: SupabaseClient, org: string) {
  await client.from("meta_campaign_executions").update({status:"uncertain",error_message:"Operação interrompida. Confira os ativos na Meta antes de repetir."})
    .eq("organization_id",org).in("status",["creating","activating","pausing"]).lt("updated_at",new Date(Date.now()-10*60000).toISOString());
  const r = await client.from("meta_campaign_executions").select(fields).eq("organization_id",org).order("created_at",{ascending:false}).limit(40);
  if(r.error) throw Error("Histórico de campanhas indisponível.");
  return r.data as Execution[];
}
async function context(client: SupabaseClient, org: string, pauseOnly=false) {
  if(!pauseOnly) await assertContractAccess(org,client);
  const ctx=await loadAdsLeadsContext(client,org); requireMetaScopes(ctx,["ads_management"]);
  if(!ctx.pageId || !ctx.adAccountId) throw Error("Selecione a Página e a conta de anúncios em Integrações.");
  const account=await adsLeadsGraph(ctx,ctx.adAccountId,{fields:"id,name,currency,account_status"},false);
  if(account.id!==ctx.adAccountId || (!pauseOnly && Number(account.account_status)!==1)) throw Error("A conta Meta selecionada não está ativa para anúncios.");
  return {ctx,account};
}
export async function prepareCampaign(client: SupabaseClient, org: string, user: string, proposalId: string, raw: unknown) {
  const existing=await client.from("meta_campaign_executions").select("id").eq("organization_id",org).eq("proposal_id",proposalId).maybeSingle();
  if(existing.error) throw Error("Não foi possível conferir duplicidade.");
  if(existing.data) return campaignHistory(client,org);
  const settings=campaignSettings(raw), {ctx,account}=await context(client,org);
  if(settings.currency!==account.currency) throw Error(`Use a moeda da conta Meta: ${String(account.currency)}.`);
  const job=await client.from("meta_creative_jobs").select("brief,result,proposal_approval,status").eq("organization_id",org).eq("id",proposalId).eq("mode","campaign").single();
  if(job.error || job.data.status!=="completed" || !job.data.proposal_approval) throw Error("Aprove primeiro uma proposta concluída desta empresa.");
  const storage=await loadR2Config(client); if(!storage.ok) throw Error("Biblioteca indisponível.");
  const mediaAssets=[];
  for(const mediaId of creativeMediaIds(job.data.brief)) {
    const media=await client.from("content_pipeline_items").select("id,metadata").eq("organization_id",org).eq("scope","organization").eq("content_type","meta_organic_media").eq("id",mediaId).single();
    const m=metaRecord(media.data?.metadata);
    if(media.error || !["image/jpeg","video/mp4"].includes(String(m.content_type)) || typeof m.storage_key!=="string" || !m.storage_key.startsWith(`meta/organic/${org}/`) || m.storage_key.includes("..")) throw Error("O criativo original não está disponível nesta empresa.");
    mediaAssets.push({id:media.data!.id,url:buildPublicObjectUrl(storage.config.publicUrl,m.storage_key),contentType:String(m.content_type)});
  }
  if(!mediaAssets.length)throw Error("Selecione um criativo para a campanha.");
  const integration=await client.from("organization_integrations").select("metadata").eq("id",ctx.integrationId).eq("organization_id",org).single();
  if(integration.error) throw Error("Não foi possível conferir o Instagram selecionado.");
  const snapshot=executionSnapshot(job.data.result as CreativeReport,settings,{accountId:ctx.adAccountId,accountName:String(account.name),pageId:ctx.pageId,
    instagramId:selectedMetaAsset(metaRecord(integration.data.metadata),"instagram_business_id"),
    media:mediaAssets[0],...(mediaAssets.length>1?{additionalMedia:mediaAssets.slice(1)}:{})});
  const saved=await client.from("meta_campaign_executions").insert({organization_id:org,proposal_id:proposalId,user_id:user,snapshot,snapshot_hash:digest(snapshot)});
  if(saved.error) throw Error("A preparação já existe ou não pôde ser salva. Atualize o histórico.");
  return campaignHistory(client,org);
}
async function readExecution(client: SupabaseClient,org:string,id:string) {
  const r=await client.from("meta_campaign_executions").select(fields).eq("organization_id",org).eq("id",id).single();
  if(r.error || !r.data) throw Error("Campanha não encontrada nesta empresa."); return r.data as Execution;
}
// Fingerprint excludes statuses (our activation changes them), but includes all spend,
// audience, destination and creative settings. Additions to the hierarchy also invalidate it.
async function remoteState(ctx:AdsLeadsContext,e:Execution) {
  const ids=e.remote_ids,s=e.snapshot;
  const campaign=await adsLeadsGraph(ctx,ids.campaign,{fields:"id,account_id,name,objective,daily_budget,lifetime_budget,spend_cap,bid_strategy,special_ad_categories,status"},false);
  const sets=await adsLeadsGraph(ctx,`${ids.campaign}/adsets`,{fields:"id,account_id,campaign_id,name,daily_budget,lifetime_budget,targeting,start_time,end_time,optimization_goal,billing_event,bid_strategy,destination_type,status",limit:"100"},false);
  const ads=await adsLeadsGraph(ctx,`${ids.campaign}/ads`,{fields:"id,account_id,campaign_id,adset_id,name,creative{id,object_story_spec,asset_feed_spec},status",limit:"100"},false);
  const setRows=(Array.isArray(sets.data)?sets.data:[]).map(metaRecord), adRows=(Array.isArray(ads.data)?ads.data:[]).map(metaRecord);
  if(metaRecord(sets.paging).next || metaRecord(ads.paging).next || setRows.length!==s.adSets.length || adRows.length!==s.ads.length) throw Error("A estrutura na Meta difere da proposta aprovada.");
  if(String(campaign.account_id)!==s.accountId.replace("act_","") || Number(campaign.spend_cap)!==s.totalMinor || campaign.objective!=="OUTCOME_TRAFFIC") throw Error("Conta ou limite de gasto divergente na Meta.");
  if(s.budgetMode==="CBO" && Number(campaign.daily_budget)!==s.dailyMinor) throw Error("A verba diária na Meta difere da aprovação.");
  if(s.budgetMode==="ABO" && (Number(campaign.daily_budget||0)>0 || setRows.some((r)=>Number(r.daily_budget)!==s.adSets[s.adSets.findIndex((_,i)=>ids[`set_${i}`]===r.id)]?.dailyMinor))) throw Error("A divisão de verba na Meta difere da aprovação.");
  for(let i=0;i<s.adSets.length;i++) if(!setRows.some(r=>r.id===ids[`set_${i}`])) throw Error("Conjunto diferente da proposta.");
  for(let i=0;i<s.ads.length;i++) if(!adRows.some(r=>r.id===ids[`ad_${i}`])) throw Error("Anúncio diferente da proposta.");
  const statuses=[campaign,...setRows,...adRows].map(r=>String(r.status));
  const strip=(r:Record<string,unknown>)=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=="status").sort(([a],[b])=>a.localeCompare(b)));
  const hash=digest({campaign:strip(campaign),sets:setRows.sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(strip),ads:adRows.sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(strip)});
  return {hash,statuses,campaignStatus:campaign.status};
}
export async function executeCampaign(client:SupabaseClient,org:string,user:string,id:string,action:"create_paused"|"activate"|"pause",approval:unknown) {
  const e=await readExecution(client,org,id),s=e.snapshot;
  const {ctx}=await context(client,org,action==="pause");
  if(ctx.adAccountId!==s.accountId || ctx.pageId!==s.pageId) throw Error("A conexão foi alterada. Reconecte os ativos originais antes de operar esta campanha.");
  const allowed=action==="create_paused"?["draft","awaiting_media","blocked"]:action==="activate"?["paused"]:["active","paused","blocked","uncertain"];
  if(!allowed.includes(e.status)) throw Error("Operação em andamento ou estado incompatível. Atualize o histórico; não recrie a campanha.");
  if(action==="activate") assertBudgetApproval(s,e.snapshot_hash,approval);
  const status=action==="create_paused"?"creating":action==="activate"?"activating":"pausing";
  const locked=await client.from("meta_campaign_executions").update({status,updated_at:new Date().toISOString(),error_message:null}).eq("id",id).eq("organization_id",org).eq("status",e.status).select("id").maybeSingle();
  if(locked.error || !locked.data) throw Error("Outra operação está em andamento.");
  const update=async(values:Record<string,unknown>)=>{const r=await client.from("meta_campaign_executions").update({...values,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",org);if(r.error) throw Error("Não foi possível registrar a confirmação da Meta. Não repita a operação.");};
  const write=async(key:string,path:string,params:Record<string,string>)=>{
    if(e.remote_ids[key]) return {id:e.remote_ids[key]};
    await update({pending_step:key});
    const r=await adsLeadsGraph(ctx,path,params,false,"POST");
    if(typeof r.id!=="string" || !/^\d+$/.test(r.id)) throw Error("A Meta não confirmou o identificador criado.");
    e.remote_ids[key]=r.id;await update({remote_ids:e.remote_ids,pending_step:null}); return r;
  };
  try {
    if(action==="pause") {
      if(!e.remote_ids.campaign) throw Error("Nenhuma campanha confirmada para pausar.");
      await adsLeadsGraph(ctx,e.remote_ids.campaign,{status:"PAUSED"},false,"POST");
      const r=await adsLeadsGraph(ctx,e.remote_ids.campaign,{fields:"status"},false);
      if(r.status!=="PAUSED") throw Error("Pausa ainda não confirmada pela Meta.");
      // Incomplete creation remains uncertain; never unlock activation accidentally.
      await update({status:e.remote_fingerprint?"paused":e.status==="blocked"?"blocked":"uncertain",pending_step:null});
    } else if(action==="create_paused") {
      if(e.remote_ids.campaign && (await adsLeadsGraph(ctx,e.remote_ids.campaign,{fields:"status"},false)).status!=="PAUSED") throw Error("Pause a campanha na Meta antes de continuar sua criação.");
      let imageUrl="",imageHash=e.remote_ids.image;
      if(s.media.contentType==="video/mp4") {
        if(!e.remote_ids.video) await write("video",`${s.accountId}/advideos`,{file_url:s.media.url,title:s.name});
        const video=await adsLeadsGraph(ctx,e.remote_ids.video,{fields:"status,thumbnails"},false);
        const thumbs=metaRecord(video.thumbnails).data;
        imageUrl=Array.isArray(thumbs)?String(metaRecord(thumbs[0]).uri||""):"";
        if(metaRecord(video.status).video_status!=="ready" || !imageUrl) {await update({status:"awaiting_media",pending_step:null});return campaignHistory(client,org);}
      } else if(!imageHash) {
        const response=await fetch(s.media.url,{redirect:"error",signal:AbortSignal.timeout(30000)});
        if(!response.ok || Number(response.headers.get("content-length"))>8*1024*1024) throw Error("Criativo indisponível ou acima de 8 MB.");
        const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>8*1024*1024) throw Error("Imagem acima de 8 MB.");
        await update({pending_step:"image"});
        const uploaded=await adsLeadsGraph(ctx,`${s.accountId}/adimages`,{bytes:bytes.toString("base64")},false,"POST");
        imageHash=String(metaRecord(Object.values(metaRecord(uploaded.images))[0]).hash||"");
        if(!imageHash) throw Error("A Meta não confirmou a imagem.");
        e.remote_ids.image=imageHash;await update({remote_ids:e.remote_ids,pending_step:null});
      }
      for(const [index,media] of (s.additionalMedia??[]).entries()) {
        const key=`image_${index+1}`;if(e.remote_ids[key])continue;
        const response=await fetch(media.url,{redirect:"error",signal:AbortSignal.timeout(30000)});
        if(!response.ok||Number(response.headers.get("content-length"))>8*1024*1024)throw Error("Slide indisponível ou acima de 8 MB.");
        const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>8*1024*1024)throw Error("Slide acima de 8 MB.");
        await update({pending_step:key});const uploaded=await adsLeadsGraph(ctx,`${s.accountId}/adimages`,{bytes:bytes.toString("base64")},false,"POST");
        const hash=String(metaRecord(Object.values(metaRecord(uploaded.images))[0]).hash||"");if(!hash)throw Error("A Meta não confirmou o slide.");
        e.remote_ids[key]=hash;await update({remote_ids:e.remote_ids,pending_step:null});
      }
      const start=e.start_at||new Date(Date.now()+5*60000).toISOString(),end=e.end_at||new Date(Date.now()+5*60000+s.settings.days*86400000).toISOString();
      if(Date.parse(end)<=Date.now()) throw Error("O período terminou. Prepare uma nova proposta.");
      e.start_at=start;e.end_at=end;await update({start_at:start,end_at:end});
      await write("campaign",`${s.accountId}/campaigns`,campaignPayload(s));
      for(let i=0;i<s.adSets.length;i++) await write(`set_${i}`,`${s.accountId}/adsets`,adSetPayload(s,e.remote_ids.campaign,i,start,end));
      for(let i=0;i<s.ads.length;i++) {
        const a=s.ads[i],cta={type:"LEARN_MORE",value:{link:s.settings.destination}};
        const spec={page_id:s.pageId,...(s.settings.placement==="feeds"?{instagram_user_id:s.instagramId}:{}),
          ...(e.remote_ids.video?{video_data:{video_id:e.remote_ids.video,image_url:imageUrl,title:a.headline,message:a.primaryText,call_to_action:cta}}:{link_data:{...(s.additionalMedia?.length?{child_attachments:[s.media,...s.additionalMedia].map((_,n)=>({image_hash:n?e.remote_ids[`image_${n}`]:imageHash,link:s.settings.destination,name:a.headline,call_to_action:cta})),multi_share_optimized:false,multi_share_end_card:false}:{image_hash:imageHash}),link:s.settings.destination,name:a.headline,message:a.primaryText,call_to_action:cta}})};
        await write(`creative_${i}`,`${s.accountId}/adcreatives`,{name:a.name,object_story_spec:JSON.stringify(spec)});
        await write(`ad_${i}`,`${s.accountId}/ads`,{name:a.name,adset_id:e.remote_ids[`set_${i%s.adSets.length}`],creative:JSON.stringify({creative_id:e.remote_ids[`creative_${i}`]}),status:"PAUSED"});
      }
      const state=await remoteState(ctx,e);
      if(state.statuses.some(s=>s!=="PAUSED")) throw Error("A Meta não confirmou todos os objetos pausados.");
      await update({status:"paused",remote_fingerprint:state.hash,pending_step:null});
    } else {
      const state=await remoteState(ctx,e);
      if(!e.remote_fingerprint || state.hash!==e.remote_fingerprint || state.campaignStatus!=="PAUSED") throw Error("A campanha mudou na Meta. A ativação foi bloqueada para nova conferência.");
      if(!e.end_at || Date.parse(e.end_at)<=Date.now()) throw Error("O período da campanha terminou. Prepare uma nova proposta.");
      await update({activation_approval:{userId:user,approvedAt:new Date().toISOString(),snapshotHash:e.snapshot_hash,remoteFingerprint:state.hash,totalMinor:s.totalMinor,currency:s.settings.currency},pending_step:"activation"});
      // The parent stays paused while children are prepared. Only this final explicit
      // approval may unpause the campaign; no AI tool or background job can activate it.
      for(let i=0;i<s.ads.length;i++) await adsLeadsGraph(ctx,e.remote_ids[`ad_${i}`],{status:"ACTIVE"},false,"POST");
      for(let i=0;i<s.adSets.length;i++) await adsLeadsGraph(ctx,e.remote_ids[`set_${i}`],{status:"ACTIVE"},false,"POST");
      const beforeParent=await remoteState(ctx,e);
      if(beforeParent.hash!==state.hash || beforeParent.campaignStatus!=="PAUSED") throw Error("A campanha mudou durante a conferência; ativação interrompida.");
      await adsLeadsGraph(ctx,e.remote_ids.campaign,{status:"ACTIVE"},false,"POST");
      const confirmed=await remoteState(ctx,e);
      if(confirmed.hash!==state.hash || confirmed.statuses.some(s=>s!=="ACTIVE")) throw Error("Ativação não confirmada integralmente.");
      await update({status:"active",pending_step:null});
    }
  } catch(error) {
    // Compensating pause is safe even if the activation response was lost.
    let paused=false;
    if(e.remote_ids.campaign) try {await adsLeadsGraph(ctx,e.remote_ids.campaign,{status:"PAUSED"},false,"POST");paused=(await adsLeadsGraph(ctx,e.remote_ids.campaign,{fields:"status"},false)).status==="PAUSED";}catch{}
    const message=error instanceof Error?error.message:"Operação Meta em conferência.";
    const blocked=action==="create_paused" && error instanceof MetaGraphError && error.definitive && (!e.remote_ids.campaign||paused);
    await update({status:blocked?"blocked":"uncertain",...(blocked?{pending_step:null}:{}),error_message:`${message}${paused?" Campanha confirmada pausada.":" Confira o estado no Gerenciador da Meta."}`});
    throw Error(`${message} A operação não será repetida automaticamente.`);
  }
  return campaignHistory(client,org);
}
