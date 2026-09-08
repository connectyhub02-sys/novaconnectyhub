import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { getContractAccess } from "@/lib/billing/contract-access";
import { createAiSecret, record } from "@/lib/ai-api/gateway";
import { assertOrganizationOperationalAccess } from "@/lib/billing/access-control";
import {publicUsageCalculation} from "@/lib/billing/public-usage-calculation";
async function context() {
  const workspace = await getCurrentWorkspace();
  if (!workspace?.organization) throw new Error("Sessão obrigatória.");
  const client = createServiceClient();
  const access = await getContractAccess(workspace.organization.id, client);
  return { workspace, client, org: access.billing_organization_id };
}
export async function GET() {
  try {
    const { client, org } = await context();
    const [projects, wallet, activity] = await Promise.all([
      client.from("ai_projects").select("*,ai_api_keys(id,name,key_prefix,status,last_used_at,created_at)").eq("organization_id",org).order("created_at",{ascending:false}).limit(100),
      client.from("credit_wallets").select("balance_credits,reserved_credits").eq("organization_id",org).maybeSingle(),
      client.from("ai_requests").select("id,project_id,status,model_id,charged_credits,reserved_credits,created_at,error_code,usage_events(input_tokens,output_tokens,metadata)").eq("organization_id",org).order("created_at",{ascending:false}).limit(100),
    ]);
    if (projects.error || wallet.error || activity.error) throw new Error("Não foi possível carregar a API de IA.");
    // Customer payload never includes provider costs/margins or secret hashes.
    const usage = (activity.data ?? []).map((r) => { const u=record(r.usage_events); return { ...r, usage_events:undefined, calculation: { input:Number(u.input_tokens ?? 0), output:Number(u.output_tokens ?? 0), ...publicUsageCalculation(u.metadata) } }; });
    return NextResponse.json({ projects:projects.data, wallet:wallet.data, activity:usage },{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Falha ao carregar."},{status:403}); }
}
export async function POST(request: Request) {
  try {
    const { workspace, client, org } = await context();
    const membership=await client.from("organization_members").select("role").eq("organization_id",org).eq("user_id",workspace.user.id).maybeSingle();
    if (!workspace.profile.isPlatformAdmin && (membership.error||!["owner","admin"].includes(membership.data?.role))) return NextResponse.json({error:"Somente administradores da conta de faturamento podem gerenciar chaves."},{status:403});
    await assertOrganizationOperationalAccess({organizationId:org,client});
    const body=record(await request.json());
    if(body.action==="create_project"||body.action==="update_project") {
      const name=String(body.name??"").trim(); const budget=body.monthly_credit_limit===null || body.monthly_credit_limit==="" ? null : Number(body.monthly_credit_limit);
      const rpm=Number(body.requests_per_minute??30), output=Number(body.max_output_tokens??2048);
      if(!name || name.length>100 || (budget!==null && (!Number.isFinite(budget)||budget<=0)) || !Number.isInteger(rpm)||rpm<1||rpm>300||!Number.isInteger(output)||output<1||output>8192) throw new Error("Confira nome, limite mensal, chamadas por minuto e tamanho da resposta.");
      const values={name,monthly_credit_limit:budget,requests_per_minute:rpm,max_output_tokens:output};
      const mutation=body.action==="create_project"?client.from("ai_projects").insert({organization_id:org,...values}):client.from("ai_projects").update(values).eq("id",body.projectId).eq("organization_id",org);
      const {data,error}=await mutation.select("id").single();
      if(error) throw new Error("Não foi possível criar o projeto.");
      return NextResponse.json({project:data});
    }
    const {data:project,error:projectError}=await client.from("ai_projects").select("id").eq("id",body.projectId).eq("organization_id",org).maybeSingle();
    if(projectError||!project) throw new Error("Projeto não encontrado nesta conta.");
    if(body.action==="create_key") {
      const key=createAiSecret(), name=String(body.name??"Chave do projeto").trim().slice(0,100);
      const {error}=await client.from("ai_api_keys").insert({project_id:project.id,name,key_hash:key.key_hash,key_prefix:key.key_prefix});
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
