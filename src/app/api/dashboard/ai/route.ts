import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { getContractAccess } from "@/lib/billing/contract-access";
import { createAiSecret, record } from "@/lib/ai-api/gateway";
import { assertOrganizationOperationalAccess } from "@/lib/billing/access-control";
import { loadPublicAiModels, assertAiModelAvailable } from "@/lib/ai-api/model-service";
import { recommendedAiModel } from "@/lib/ai-api/model-catalog";
import { aiUsagePeriod, aiUsageStart } from "@/lib/ai-api/usage";
async function context() {
  const workspace = await getCurrentWorkspace();
  if (!workspace?.organization) throw new Error("Sessão obrigatória.");
  const client = createServiceClient();
  const access = await getContractAccess(workspace.organization.id, client);
  return { workspace, client, org: access.billing_organization_id, planCode:access.plan_code };
}
export async function GET(request: Request) {
  try {
    const { client, org, planCode } = await context();
    const url = new URL(request.url);
    const days = aiUsagePeriod(url.searchParams.get("days"));
    const projectId = url.searchParams.get("project") || null;
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new Error("Projeto inválido.");
    let recent = client.from("ai_requests").select("id,project_id,status,charged_credits,reserved_credits,created_at").eq("organization_id",org).gte("created_at",aiUsageStart(days)).order("created_at",{ascending:false}).limit(50);
    if (projectId) recent = recent.eq("project_id",projectId);
    const [projects, wallet, activity, usage, models] = await Promise.all([
      client.from("ai_projects").select("id,name,status,ai_api_keys(id,name,key_prefix,status,model_id,last_used_at,created_at)").eq("organization_id",org).order("created_at",{ascending:false}),
      client.from("credit_wallets").select("balance_credits,reserved_credits").eq("organization_id",org).maybeSingle(),
      recent,
      client.rpc("ai_usage_summary",{p_org:org,p_days:days,p_project:projectId}),
      loadPublicAiModels(client,planCode),
    ]);
    if (projects.error || wallet.error || activity.error || usage.error) throw new Error("Não foi possível carregar o uso da API. Tente atualizar novamente.");
    return NextResponse.json({ projects:projects.data, wallet:wallet.data, activity:activity.data, usage:usage.data, models },{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Falha ao carregar."},{status:403}); }
}
export async function POST(request: Request) {
  try {
    const { workspace, client, org } = await context();
    const membership=await client.from("organization_members").select("role").eq("organization_id",org).eq("user_id",workspace.user.id).maybeSingle();
    if (!workspace.profile.isPlatformAdmin && (membership.error||!["owner","admin"].includes(membership.data?.role))) return NextResponse.json({error:"Somente administradores da conta de faturamento podem gerenciar chaves."},{status:403});
    const billing=await assertOrganizationOperationalAccess({organizationId:org,client});
    const body=record(await request.json());
    if(body.action==="create_project"||body.action==="update_project") {
      const name=String(body.name??"").trim();
      if(!name || name.length>100) throw new Error("Informe um nome de até 100 caracteres.");
      if(body.action==="create_project") {
        const modelId=String(body.modelId ?? recommendedAiModel);
        await assertAiModelAvailable(client,modelId,billing.planCode);
        const key=createAiSecret();
        const {data,error}=await client.rpc("create_ai_project_with_model_key",{p_org:org,p_name:name,p_hash:key.key_hash,p_prefix:key.key_prefix,p_model:modelId});
        if(error) throw new Error("Não foi possível criar o projeto e a chave.");
        return NextResponse.json({project:{id:data},secret:key.secret},{headers:{"Cache-Control":"no-store"}});
      }
      const {data,error}=await client.from("ai_projects").update({name}).eq("id",body.projectId).eq("organization_id",org).select("id").single();
      if(error) throw new Error("Não foi possível renomear o projeto.");
      return NextResponse.json({project:data});
    }
    const {data:project,error:projectError}=await client.from("ai_projects").select("id").eq("id",body.projectId).eq("organization_id",org).maybeSingle();
    if(projectError||!project) throw new Error("Projeto não encontrado nesta conta.");
    if(body.action==="create_key") {
      const modelId=String(body.modelId ?? recommendedAiModel);
      await assertAiModelAvailable(client,modelId,billing.planCode);
      const key=createAiSecret(), name=String(body.name??"Chave do projeto").trim().slice(0,100);
      const {error}=await client.from("ai_api_keys").insert({project_id:project.id,name,key_hash:key.key_hash,key_prefix:key.key_prefix,model_id:modelId});
      if(error) throw new Error("Não foi possível criar a chave.");
      return NextResponse.json({secret:key.secret},{headers:{"Cache-Control":"no-store"}});
    }
    if(body.action==="revoke_key") {
      const {error}=await client.from("ai_api_keys").update({status:"revoked"}).eq("id",body.keyId).eq("project_id",project.id);
      if(error) throw new Error("Não foi possível revogar a chave.");
    } else if(body.action==="toggle_project") {
      const {error}=await client.from("ai_projects").update({status:body.status==="active"?"active":"paused"}).eq("id",project.id);
      if(error) throw new Error("Não foi possível atualizar o projeto.");
    } else throw new Error("Ação inválida.");
    return NextResponse.json({ok:true});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Falha ao salvar."},{status:422}); }
}
