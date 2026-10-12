import { NextResponse } from "next/server";
import { metaOrganicAccess, OrganicAccessError } from "@/lib/meta/organic-access";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { parseTrendBrief } from "@/lib/meta/trend-policy";
import { runTrendResearch, trendHistory } from "@/lib/meta/trend-research";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
async function access(request: Request) {
  const a = await metaOrganicAccess(request);
  const entitlement = resolvePlanFeatureEntitlement("ai_traffic_manager",{isPlatformAdmin:a.workspace.profile.isPlatformAdmin,organizationStatus:a.company.status,planCode:a.company.planCode,featureOverrides:a.company.featureOverrides});
  if (!entitlement.allowed || !["owner","admin"].includes(a.company.role)) throw new OrganicAccessError("A pesquisa exige acesso de gestão e IA habilitada.",403);
  return a;
}
function failure(e: unknown) { return NextResponse.json({error:e instanceof Error ? e.message : "Pesquisa indisponível."},{status:e instanceof OrganicAccessError ? e.status : 400}); }
export async function GET(request: Request) {
  try { const a=await access(request);return NextResponse.json({jobs:await trendHistory(a.client,a.organizationId)}); } catch(e) {return failure(e);}
}
export async function POST(request: Request) {
  const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:"meta-trends",maxPayloadBytes:3000,rateLimit:{limit:4,windowMs:60000}});
  if (!guard.ok) return NextResponse.json({error:guard.message},{status:guard.status});
  try {
    const a=await access(request),raw=await request.text(); if(raw.length>3000) throw Error("Solicitação muito longa.");
    const b=JSON.parse(raw);
    if (typeof b.requestId!=="string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(b.requestId)) throw Error("Solicitação inválida.");
    return NextResponse.json({jobs:await runTrendResearch(a.client,a.organizationId,a.workspace.user.id,b.requestId,parseTrendBrief(b))});
  } catch(e) {return failure(e);}
}
