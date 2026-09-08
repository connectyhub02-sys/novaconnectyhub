import {NextResponse} from "next/server";
import {getCurrentWorkspace} from "@/lib/supabase/profile";
import {createServiceClient} from "@/lib/supabase/service";
import {getContractAccess} from "@/lib/billing/contract-access";
import {loadBillingOrderBumpProductOptions} from "@/lib/billing/plan-checkout";
async function context(){const w=await getCurrentWorkspace();if(!w?.organization)throw new Error("Entre na sua conta.");const c=createServiceClient();const a=await getContractAccess(w.organization.id,c);return {w,c,org:a.billing_organization_id};}
export async function GET(){try{
 const {w,c,org}=await context();
 const [packs,policy,cards,wallet,alerts,runs,owner]=await Promise.all([
 loadBillingOrderBumpProductOptions(c),
 c.from("credit_topup_policies").select("enabled,product_id,card_method_id,threshold_credits,agreed_amount_brl,agreed_credits,monthly_cap_brl,authorized_at").eq("organization_id",org).maybeSingle(),
 c.from("billing_asaas_card_vault").select("id,created_at").eq("organization_id",org).eq("status","active"),
 c.from("credit_wallets").select("balance_credits,reserved_credits").eq("organization_id",org).maybeSingle(),
 c.from("wallet_alert_state").select("reference_credits,absolute_low:absolute_low_credits,absolute_critical:absolute_critical_credits").eq("organization_id",org).maybeSingle(),
 c.from("credit_topup_runs").select("id,amount_brl,credits,created_at,billing_card_attempts(state)").eq("organization_id",org).order("created_at",{ascending:false}).limit(30),
 c.from("organizations").select("owner_id").eq("id",org).single()]);
 if([policy,cards,wallet,alerts,runs].some(r=>r.error))throw new Error("Não foi possível consultar recargas e autorizações.");
 return NextResponse.json({packs:packs.filter(p=>p.available&&p.billingCycle==="one_time"&&(p.creditAmount??0)>0).map(p=>({id:p.id,name:p.name,amount:p.priceBrl,credits:p.creditAmount})),policy:policy.data,cards:cards.data,wallet:wallet.data,alerts:alerts.data,runs:runs.data,canAuthorize:!owner.error&&owner.data?.owner_id===w.user.id},{headers:{"Cache-Control":"no-store"}});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Falha ao carregar."},{status:403});}}
export async function POST(request:Request){try{
 const {w,c,org}=await context();const body=await request.json();
 const owner=await c.from("organizations").select("owner_id").eq("id",org).single();
 if(owner.error||owner.data?.owner_id!==w.user.id)return NextResponse.json({error:"Somente o titular pode autorizar recargas e configurar avisos."},{status:403});
 if(body.action==="alerts"){
  const low=body.low===""||body.low===null?null:Number(body.low),critical=body.critical===""||body.critical===null?null:Number(body.critical);
  if((low!==null&&(!Number.isFinite(low)||low<0))||(critical!==null&&(!Number.isFinite(critical)||critical<0))||(low!==null&&critical!==null&&critical>low))throw new Error("O limiar crítico deve ser menor ou igual ao aviso inicial.");
  const r=await c.from("wallet_alert_state").upsert({organization_id:org,absolute_low_credits:low,absolute_critical_credits:critical},{onConflict:"organization_id"});if(r.error)throw new Error("Não foi possível salvar os avisos.");
  await c.from("wallet_alert_queue").upsert({organization_id:org,updated_at:new Date().toISOString()},{onConflict:"organization_id"});
 }else{
  const result=await c.rpc("save_credit_topup_policy",{p_org:org,p_actor:w.user.id,p_terms:body});
  if(result.error)throw new Error("Confira o pacote, o cartão e os limites. Se o preço mudou, atualize a página e autorize as novas condições.");
 }
 return NextResponse.json({ok:true});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível salvar."},{status:422});}}
