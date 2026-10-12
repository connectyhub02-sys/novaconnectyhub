import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adsLeadsGraph, loadAdsLeadsContext, metaRecord, requireMetaScopes, type AdsLeadsContext } from "./ads-leads-context";
import { canDeliverConversion, conversionHash, purchaseData } from "./conversion-policy";

export async function listMetaPixels(ctx: AdsLeadsContext) {
  requireMetaScopes(ctx,["ads_read"]);
  if (!ctx.adAccountId) throw new Error("Salve uma conta de anúncios na conexão Meta primeiro.");
  const pixels: {id:string;name:string}[]=[];
  let after="";
  for(let n=0;n<10;n++) {
    const result=await adsLeadsGraph(ctx,`${ctx.adAccountId}/adspixels`,{fields:"id,name",limit:"100",...(after?{after}:{})},false);
    for(const raw of Array.isArray(result.data)?result.data:[]) {
      const p=metaRecord(raw);if(typeof p.id==="string"&&/^\d+$/.test(p.id))pixels.push({id:p.id,name:String(p.name||p.id)});
    }
    const paging=metaRecord(result.paging); after=String(metaRecord(paging.cursors).after||"");
    if(!paging.next||!after)return pixels;
  }
  throw new Error("Há mais de 1.000 Pixels nesta conta. Refine o acesso aos ativos.");
}
export async function pixelConfiguration(client:SupabaseClient,organizationId:string) {
  const result=await client.from("meta_pixel_connections").select("*").eq("organization_id",organizationId).maybeSingle();
  if(result.error)throw new Error("Não foi possível consultar o Pixel.");
  return result.data;
}
export async function savePixelConfiguration(ctx:AdsLeadsContext,input:{pixelId:string;enabled:boolean;testEventCode:string}) {
  const pixel=(await listMetaPixels(ctx)).find(p=>p.id===input.pixelId);
  if(!pixel)throw new Error("O Pixel não pertence à conta de anúncios selecionada ou não está acessível.");
  if(input.enabled)requireMetaScopes(ctx,["ads_management"]);
  if(input.testEventCode&&!/^[A-Za-z0-9_-]{1,80}$/.test(input.testEventCode))throw new Error("Código de teste inválido.");
  const previous=await pixelConfiguration(ctx.client,ctx.organizationId);
  const unchanged=previous?.pixel_id===pixel.id&&previous.ad_account_id===ctx.adAccountId&&previous.enabled===input.enabled&&previous.test_event_code===(input.testEventCode||null);
  const saved=await ctx.client.from("meta_pixel_connections").upsert({organization_id:ctx.organizationId,ad_account_id:ctx.adAccountId,
    pixel_id:pixel.id,pixel_name:pixel.name,enabled:input.enabled,test_event_code:input.testEventCode||null,revision:unchanged?previous.revision:randomUUID(),updated_at:new Date().toISOString()});
  if(saved.error)throw new Error("Não foi possível salvar o Pixel.");
  return pixelConfiguration(ctx.client,ctx.organizationId);
}
export async function queueConversion(client:SupabaseClient,input:{organizationId:string;visitorId:string;config:Record<string,unknown>;name:string;eventId:string;sourceUrl:string;userData:Record<string,unknown>;customData?:Record<string,unknown>;eventTime?:number}) {
  const eventTime=input.eventTime??Math.floor(Date.now()/1000);
  const result=await client.from("meta_conversion_events").upsert({organization_id:input.organizationId,visitor_id:input.visitorId,
    pixel_id:input.config.pixel_id,revision:input.config.revision,event_name:input.name,event_id:input.eventId,event_time:eventTime,
    test_event_code:input.config.test_event_code,
    payload:{event_name:input.name,event_id:input.eventId,event_time:eventTime,action_source:"website",event_source_url:input.sourceUrl,
      user_data:input.userData,...(input.customData?{custom_data:input.customData}:{})}},
    {onConflict:"organization_id,pixel_id,event_name,event_id",ignoreDuplicates:true});
  if(result.error)throw new Error("Não foi possível registrar evento de conversão.");
}
export async function collectPaidConversions(client:SupabaseClient) {
  const rows=await client.from("meta_checkout_attributions").select("*,sales_catalog_payment_sessions!inner(status)").eq("completed",false).eq("sales_catalog_payment_sessions.status","approved")
    .gte("created_at",new Date(Date.now()-6*86400000).toISOString()).order("created_at").limit(100);
  if(rows.error)throw new Error("Falha ao consultar compras para medição.");
  for(const row of rows.data??[]) {
    const session=await client.from("sales_catalog_payment_sessions").select("id,order_id,status,currency,paid_at")
      .eq("organization_id",row.organization_id).eq("id",row.session_id).maybeSingle();
    if(session.error)throw new Error("Falha ao consultar confirmação de pagamento.");
    if(!session.data)continue;
    const order=await client.from("sales_catalog_orders").select("id,total,payment_status,customer_email,customer_phone")
      .eq("organization_id",row.organization_id).eq("id",session.data.order_id).maybeSingle();
    if(order.error)throw new Error("Falha ao consultar pedido.");
    const data=order.data?purchaseData(order.data,session.data):null;
    if(!data)continue;
    const userData={...row.user_data};
    if(order.data?.customer_email)userData.em=[conversionHash(String(order.data.customer_email).trim().toLowerCase())];
    if(order.data?.customer_phone)userData.ph=[conversionHash(String(order.data.customer_phone).replace(/\D/g,""))];
    await queueConversion(client,{organizationId:row.organization_id,visitorId:row.visitor_id,config:row,name:"Purchase",
      eventId:`purchase_${session.data.order_id}`,sourceUrl:row.source_url,userData,customData:data,
      eventTime:session.data.paid_at?Math.floor(new Date(session.data.paid_at).getTime()/1000):undefined});
    await client.from("meta_checkout_attributions").update({completed:true}).eq("organization_id",row.organization_id).eq("session_id",row.session_id);
  }
}
export async function processConversions(client:SupabaseClient,organizationId?:string) {
  let query=client.from("meta_conversion_events").select("*").in("status",["pending","failed","sending"])
    .lt("attempts",5).lte("next_attempt_at",new Date().toISOString()).order("created_at").limit(40);
  if(organizationId)query=query.eq("organization_id",organizationId);
  const jobs=await query;if(jobs.error)throw new Error("Falha ao consultar fila de conversões.");
  let sent=0,failed=0,cancelled=0;
  for(const job of jobs.data??[]) {
    const claimed=await client.from("meta_conversion_events").update({status:"sending",attempts:job.attempts+1,next_attempt_at:new Date(Date.now()+120000).toISOString()})
      .eq("id",job.id).eq("attempts",job.attempts).eq("status",job.status).select("id").maybeSingle();
    if(claimed.error||!claimed.data)continue;
    try {
      const ctx=await loadAdsLeadsContext(client,job.organization_id);
      const [config,consent]=await Promise.all([pixelConfiguration(client,job.organization_id),client.from("meta_pixel_consents").select("granted")
        .eq("organization_id",job.organization_id).eq("visitor_id",job.visitor_id).maybeSingle()]);
      if(consent.error)throw new Error("Falha ao verificar consentimento.");
      if(!canDeliverConversion(job,config,ctx.adAccountId,consent.data?.granted===true)) {
        await client.from("meta_conversion_events").update({status:"cancelled",error_message:"Conexão, configuração ou consentimento não vigente."}).eq("id",job.id);cancelled++;continue;
      }
      requireMetaScopes(ctx,["ads_management"]);
      const result=await adsLeadsGraph(ctx,`${job.pixel_id}/events`,{data:JSON.stringify([job.payload]),...(job.test_event_code?{test_event_code:job.test_event_code}:{})},false,"POST");
      if(result.events_received!==1)throw new Error("A Meta não confirmou o recebimento do evento.");
      const saved=await client.from("meta_conversion_events").update({status:"sent",sent_at:new Date().toISOString(),error_message:null,
        receipt:{events_received:result.events_received,fbtrace_id:result.fbtrace_id??null},payload:{...job.payload,user_data:{}}}).eq("id",job.id);
      if(saved.error)throw new Error("Recebimento pendente de registro local; repetição usará o mesmo ID.");
      sent++;
    }catch(error){failed++;await client.from("meta_conversion_events").update({status:"failed",error_message:error instanceof Error?error.message.slice(0,300):"Falha de entrega.",
      next_attempt_at:new Date(Date.now()+Math.pow(2,job.attempts)*60000).toISOString()}).eq("id",job.id);}
  }
  return {sent,failed,cancelled};
}
