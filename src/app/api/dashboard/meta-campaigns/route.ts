import { NextResponse } from "next/server";
import { metaOrganicAccess, OrganicAccessError } from "@/lib/meta/organic-access";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { campaignHistory, prepareCampaign, executeCampaign } from "@/lib/meta/campaign-execution";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
async function access(request:Request,pauseOnly=false){const a=await metaOrganicAccess(request,{pauseCampaignOnly:pauseOnly});const e=resolvePlanFeatureEntitlement("ai_traffic_manager",{isPlatformAdmin:a.workspace.profile.isPlatformAdmin,organizationStatus:a.company.status,planCode:a.company.planCode,featureOverrides:a.company.featureOverrides});if((!pauseOnly&&!e.allowed)||!["owner","admin"].includes(a.company.role))throw new OrganicAccessError("Somente gestores desta empresa podem operar campanhas.",403);return a;}
const failure=(e:unknown)=>NextResponse.json({error:e instanceof Error?e.message:"Operação indisponível."},{status:e instanceof OrganicAccessError?e.status:400});
export async function GET(request:Request){try{const a=await access(request);return NextResponse.json({campaigns:await campaignHistory(a.client,a.organizationId)});}catch(e){return failure(e);}}
export async function POST(request:Request){
 const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:"meta-campaigns",maxPayloadBytes:12000,rateLimit:{limit:10,windowMs:60000}});
 if(!guard.ok)return NextResponse.json({error:guard.message},{status:guard.status});
 try{const raw=await request.text();if(raw.length>12000)throw Error("Solicitação muito grande.");const b=JSON.parse(raw);const a=await access(request,b.action==="pause");
 if(typeof b.id!=="string"||!/^[a-f0-9-]{36}$/i.test(b.id))throw Error("Identificador inválido.");
 const campaigns=b.action==="prepare"?await prepareCampaign(a.client,a.organizationId,a.workspace.user.id,b.id,b.settings):["create_paused","activate","pause"].includes(b.action)?await executeCampaign(a.client,a.organizationId,a.workspace.user.id,b.id,b.action,b):null;
 if(!campaigns)throw Error("Ação inválida.");return NextResponse.json({campaigns});
 }catch(e){return failure(e);}
}
