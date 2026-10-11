import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adsLeadsGraph, loadAdsLeadsContext, metaRecord, requireMetaScopes, type AdsLeadsContext } from "./ads-leads-context";
import type { MetaWebhookEvent } from "./webhook-events";

const id = (v:unknown):string => typeof v === "string" && /^\d+$/.test(v) ? v : "";
export async function listLeadForms(ctx: AdsLeadsContext) {
  requireMetaScopes(ctx,["pages_manage_ads","leads_retrieval"]);
  if (!ctx.pageId) throw new Error("Selecione a Página em Integrações.");
  const forms: {id:string;name:string;status:string}[] = [];
  let after = "";
  for (let n=0;n<10;n++) {
    const body = await adsLeadsGraph(ctx,`${ctx.pageId}/leadgen_forms`,{fields:"id,name,status",limit:"100",...(after?{after}:{})});
    for (const value of Array.isArray(body.data) ? body.data : []) {
      const f = metaRecord(value);
      if (id(f.id)) forms.push({id:id(f.id),name:String(f.name??f.id),status:String(f.status??"")});
    }
    const paging=metaRecord(body.paging); after=typeof metaRecord(paging.cursors).after === "string" ? String(metaRecord(paging.cursors).after) : "";
    if (!paging.next || !after) return forms;
  }
  throw new Error("A Página excedeu o limite de 1.000 formulários nesta consulta.");
}
export async function setLeadForm(ctx: AdsLeadsContext, formId:string, enabled:boolean) {
  const form=(await listLeadForms(ctx)).find(f=>f.id===formId);
  if (!form) throw new Error("Formulário não pertence à Página selecionada.");
  if (enabled) {
    requireMetaScopes(ctx,["pages_manage_metadata"]);
    const current=await adsLeadsGraph(ctx,`${ctx.pageId}/subscribed_apps`,{fields:"id,subscribed_fields"});
    const app=(Array.isArray(current.data)?current.data:[]).map(metaRecord).find(a=>a.id===ctx.config.appId);
    const fields=Array.isArray(app?.subscribed_fields)?app.subscribed_fields.filter((f):f is string=>typeof f==="string"):[];
    const result=await adsLeadsGraph(ctx,`${ctx.pageId}/subscribed_apps`,{subscribed_fields:[...new Set([...fields,"leadgen"])].join(",")},true,"POST");
    if(result.success!==true) throw new Error("Meta não confirmou a assinatura de leads.");
  }
  const saved=await ctx.client.from("meta_lead_forms").upsert({organization_id:ctx.organizationId,page_id:ctx.pageId,form_id:formId,name:form.name,enabled,updated_at:new Date().toISOString()},{onConflict:"organization_id,form_id"});
  if(saved.error)throw new Error("Não foi possível salvar o formulário.");
  return {formId,enabled};
}
export async function enqueueLeadAdsEvent(client:SupabaseClient,organizationId:string,event:MetaWebhookEvent) {
  const change=metaRecord(event.payload.change),value=metaRecord(change.value);
  if(event.payload.object!=="page"||change.field!=="leadgen")return false;
  if(!id(value.leadgen_id)||!id(value.form_id)||value.page_id!==event.assetId)throw new Error("Evento Lead Ads inválido.");
  const form=await client.from("meta_lead_forms").select("form_id").eq("organization_id",organizationId)
    .eq("page_id",event.assetId).eq("form_id",value.form_id).eq("enabled",true).maybeSingle();
  if(form.error)throw new Error("Não foi possível consultar formulário Lead Ads.");
  if(!form.data)return true;
  const saved=await client.from("meta_lead_deliveries").upsert({organization_id:organizationId,page_id:event.assetId,form_id:value.form_id,leadgen_id:value.leadgen_id},
    {onConflict:"organization_id,leadgen_id",ignoreDuplicates:true});
  if(saved.error)throw new Error("Não foi possível registrar lead Meta.");
  return true;
}
export function parseLeadFields(raw:unknown) {
  const lead=metaRecord(raw);
  const fields:Record<string,string[]>=Object.create(null);
  for(const value of Array.isArray(lead.field_data)?lead.field_data:[]) {
    const f=metaRecord(value);
    if(typeof f.name!=="string"||!Array.isArray(f.values))continue;
    fields[f.name]=f.values.filter((v):v is string=>typeof v==="string").map(v=>v.slice(0,4000));
  }
  return {display_name:(fields.full_name?.[0]||[fields.first_name?.[0],fields.last_name?.[0]].filter(Boolean).join(" ")||"Lead Meta").slice(0,200),
    email:fields.email?.[0]??null,phone:fields.phone_number?.[0]??null,field_data:fields,
    meta_ad_id:id(lead.ad_id)||null,submitted_at:typeof lead.created_time==="string"?lead.created_time:null};
}
export async function processLeadAdsBatch(client:SupabaseClient,organizationId?:string) {
  let query=client.from("meta_lead_deliveries").select("id,organization_id,page_id,form_id,leadgen_id,attempts")
    .in("status",["pending","failed"]).lt("attempts",5).order("created_at").limit(20);
  if(organizationId)query=query.eq("organization_id",organizationId);
  const jobs=await query;
  if(jobs.error)throw new Error("Não foi possível consultar fila Lead Ads.");
  let imported=0,failed=0;
  for(const job of jobs.data??[]) {
    try {
      const ctx=await loadAdsLeadsContext(client,job.organization_id);
      requireMetaScopes(ctx,["leads_retrieval"]);
      if(ctx.pageId!==job.page_id)throw new Error("Página do lead não está mais conectada.");
      const form=await client.from("meta_lead_forms").select("form_id").eq("organization_id",job.organization_id).eq("form_id",job.form_id).eq("page_id",job.page_id).eq("enabled",true).maybeSingle();
      if(form.error||!form.data)throw new Error("Formulário desativado.");
      const lead=await adsLeadsGraph(ctx,job.leadgen_id,{fields:"id,form_id,ad_id,created_time,field_data"});
      if(lead.id!==job.leadgen_id||lead.form_id!==job.form_id)throw new Error("Lead fora do formulário autorizado.");
      const saved=await client.rpc("import_meta_lead_delivery",{p_delivery_id:job.id,p_organization_id:job.organization_id,p_data:parseLeadFields(lead)});
      if(saved.error)throw new Error("Não foi possível importar lead ao CRM.");
      imported++;
    } catch(error) {
      failed++;
      await client.from("meta_lead_deliveries").update({status:"failed",attempts:job.attempts+1,error_message:error instanceof Error?error.message.slice(0,300):"Falha de importação."})
        .eq("id",job.id).neq("status","imported");
    }
  }
  return {imported,failed};
}
export async function importRecentLeadAds(ctx:AdsLeadsContext,formId:string) {
  const form=(await listLeadForms(ctx)).find(f=>f.id===formId);
  if(!form)throw new Error("Formulário fora da Página conectada.");
  const enabled=await ctx.client.from("meta_lead_forms").select("form_id").eq("organization_id",ctx.organizationId).eq("page_id",ctx.pageId).eq("form_id",formId).eq("enabled",true).maybeSingle();
  if(enabled.error||!enabled.data)throw new Error("Ative a importação deste formulário primeiro.");
  const response=await adsLeadsGraph(ctx,`${formId}/leads`,{fields:"id",limit:"25"});
  let queued=0;
  for(const lead of Array.isArray(response.data)?response.data:[]) {
    await enqueueLeadAdsEvent(ctx.client,ctx.organizationId,{assetId:ctx.pageId,eventType:"meta.page.leadgen",sourceEventId:null,
      payload:{object:"page",change:{field:"leadgen",value:{page_id:ctx.pageId,form_id:formId,leadgen_id:metaRecord(lead).id}}}});queued++;
  }
  const reset=await ctx.client.from("meta_lead_deliveries").update({status:"pending",attempts:0,error_message:null})
    .eq("organization_id",ctx.organizationId).eq("page_id",ctx.pageId).eq("form_id",formId).eq("status","failed");
  if(reset.error)throw new Error("Não foi possível reabrir importações pendentes.");
  return {queued,...await processLeadAdsBatch(ctx.client,ctx.organizationId)};
}
