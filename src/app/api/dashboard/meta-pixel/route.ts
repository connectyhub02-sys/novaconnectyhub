import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBillableAccess } from "@/lib/billing/trial";
import { loadAdsLeadsContext } from "@/lib/meta/ads-leads-context";
import { listMetaPixels,pixelConfiguration,savePixelConfiguration,queueConversion,processConversions } from "@/lib/meta/pixel-conversions";
import { conversionUserData,conversionOrigin } from "@/lib/meta/conversion-policy";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
async function access(request:Request,write=false) {
  const requested=new URL(request.url).searchParams.get("companyId");
  const workspace=requested?await getCurrentWorkspace():await getMetaWorkspace();
  if(!workspace)throw new Error("Sessão obrigatória.");
  const companyId=requested?resolveDashboardCompanyId({workspace,requestedCompanyId:requested}):workspace.organization?.id;
  if(!companyId)throw new Error("Selecione a empresa.");
  const client=createServiceClient();
  const company=await requireMetaCompanyAccess({client,userId:workspace.user.id,companyId});
  await assertBillableAccess({client,organizationId:company.id});
  if(write&&!["owner","admin"].includes(company.role))throw new Error("Somente administradores podem configurar o Pixel.");
  return {client,organizationId:company.id};
}
export async function GET(request:Request) {
  try {
    const {client,organizationId}=await access(request);
    const ctx=await loadAdsLeadsContext(client,organizationId);
    const [config,events]=await Promise.all([pixelConfiguration(client,organizationId),client.from("meta_conversion_events")
      .select("id,event_name,event_id,status,attempts,error_message,created_at,sent_at,test_event_code,receipt").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(20)]);
    if(events.error)throw new Error("Falha ao consultar diagnóstico.");
    return json({config,adAccountId:ctx.adAccountId,events:events.data});
  }catch(error){return json({error:error instanceof Error?error.message:"Falha de acesso."},403);}
}
export async function POST(request:Request) {
  try {
    const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:"meta-pixel-config",maxPayloadBytes:4096,rateLimit:{limit:30,windowMs:60000}});
    if(!guard.ok)return json({error:guard.message},guard.status);
    if(!request.headers.get("content-type")?.startsWith("application/json"))return json({error:"JSON obrigatório."},415);
    const {client,organizationId}=await access(request,true), body=await request.json();
    if(body.action==="disable") {
      const result=await client.from("meta_pixel_connections").update({enabled:false,revision:randomUUID(),updated_at:new Date().toISOString()}).eq("organization_id",organizationId);
      if(result.error)throw new Error("Não foi possível pausar a medição.");
      return json({disabled:true});
    }
    const ctx=await loadAdsLeadsContext(client,organizationId);
    if(body.action==="list")return json({pixels:await listMetaPixels(ctx)});
    if(body.action==="save") {
      if(typeof body.pixelId!=="string"||typeof body.enabled!=="boolean"||typeof body.testEventCode!=="string")return json({error:"Configuração inválida."},422);
      return json({config:await savePixelConfiguration(ctx,body)});
    }
    if(body.action==="test") {
      const config=await pixelConfiguration(client,organizationId);
      if(!config?.enabled||!config.test_event_code||config.ad_account_id!==ctx.adAccountId)throw new Error("Salve um Pixel ativo com código de Eventos de teste da Meta.");
      if(!(await listMetaPixels(ctx)).some(p=>p.id===config.pixel_id))throw new Error("Pixel não está mais acessível.");
      const visitorId=randomUUID();
      const consent=await client.from("meta_pixel_consents").insert({organization_id:organizationId,visitor_id:visitorId,granted:true});
      if(consent.error)throw new Error("Falha ao registrar teste autorizado.");
      await queueConversion(client,{organizationId,visitorId,config,name:"PageView",eventId:`test_${randomUUID()}`,
        sourceUrl:`${conversionOrigin()}/meta-pixel-test`,userData:conversionUserData(organizationId,visitorId,request.headers.get("user-agent")||"ConnectyHub test")});
      return json(await processConversions(client,organizationId));
    }
    return json({error:"Operação inválida."},422);
  }catch(error){return json({error:error instanceof Error?error.message:"Falha ao configurar Pixel."},400);}
}
