import { NextResponse } from "next/server";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBillableAccess } from "@/lib/billing/trial";
import { loadAdsLeadsContext } from "@/lib/meta/ads-leads-context";
import { listAdsMcpTools, runAdsMcpReport } from "@/lib/meta/ads-mcp";
import { importRecentLeadAds, listLeadForms, setLeadForm } from "@/lib/meta/lead-ads";

export const runtime="nodejs";
export const dynamic="force-dynamic";
async function access(request:Request,write=false) {
  const requested=new URL(request.url).searchParams.get("companyId");
  const workspace=requested?await getCurrentWorkspace():await getMetaWorkspace();
  if(!workspace?.organization)throw new Error("Sessão e empresa obrigatórias.");
  const companyId=requested?resolveDashboardCompanyId({workspace,requestedCompanyId:requested}):workspace.organization.id;
  const client=createServiceClient();
  const company=await requireMetaCompanyAccess({client,userId:workspace.user.id,companyId});
  await assertBillableAccess({client,organizationId:company.id});
  if(write&&!["owner","admin"].includes(company.role))throw new Error("Somente administradores podem configurar a conexão.");
  return {client,organizationId:company.id};
}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request) {
  try {
    const {client,organizationId}=await access(request);
    const ctx=await loadAdsLeadsContext(client,organizationId);
    const [forms,deliveries]=await Promise.all([
      client.from("meta_lead_forms").select("form_id,page_id,name,enabled").eq("organization_id",organizationId).eq("page_id",ctx.pageId),
      client.from("meta_lead_deliveries").select("id,leadgen_id,form_id,lead_id,status,error_message,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(25)]);
    if(forms.error||deliveries.error)throw new Error("Não foi possível carregar o histórico de leads.");
    return json({pageId:ctx.pageId,adAccountId:ctx.adAccountId,scopes:ctx.scopes,forms:forms.data,deliveries:deliveries.data});
  }catch(error){return json({error:error instanceof Error?error.message:"Falha de acesso."},403);}
}
export async function POST(request:Request) {
  try {
    // Cookie-authenticated writes never accept cross-origin form submissions.
    const origin=request.headers.get("origin");
    if(origin&&origin!==new URL(request.url).origin&&origin!==process.env.NEXT_PUBLIC_APP_URL)
      return json({error:"Origem não autorizada."},403);
    if(!request.headers.get("content-type")?.startsWith("application/json"))return json({error:"JSON obrigatório."},415);
    const {client,organizationId}=await access(request,true);
    const body=await request.json();
    const ctx=await loadAdsLeadsContext(client,organizationId);
    switch(body.action) {
      case "mcp_connect": return json({tools:(await listAdsMcpTools(ctx)).map(t=>t.name),checkedAt:new Date().toISOString()});
      case "mcp_campaigns":return json({result:await runAdsMcpReport(ctx,"campaigns")});
      case "mcp_opportunities":return json({result:await runAdsMcpReport(ctx,"opportunities")});
      case "forms":return json({forms:await listLeadForms(ctx)});
      case "form_enable":
      case "form_import": {
        if(typeof body.formId!=="string"||!/^\d+$/.test(body.formId))return json({error:"Formulário inválido."},422);
        if(body.action==="form_enable") {
          if(typeof body.enabled!=="boolean")return json({error:"Ativação inválida."},422);
          return json(await setLeadForm(ctx,body.formId,body.enabled));
        }
        return json(await importRecentLeadAds(ctx,body.formId));
      }
      default:return json({error:"Operação não permitida. Ativação de anúncios indisponível."},422);
    }
  }catch(error){return json({error:error instanceof Error?error.message:"Não foi possível concluir a operação."},400);}
}
