import { NextResponse } from "next/server";
import { metaOrganicAccess, OrganicAccessError } from "@/lib/meta/organic-access";
import { creativeHistory, runCreativeJob } from "@/lib/meta/creative-studio";
import { parseCreativeBrief } from "@/lib/meta/creative-policy";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function access(request: Request) {
  const a = await metaOrganicAccess(request);
  const entitlement = resolvePlanFeatureEntitlement("ai_traffic_manager", { isPlatformAdmin: a.workspace.profile.isPlatformAdmin,
    organizationStatus: a.company.status, planCode: a.company.planCode, featureOverrides: a.company.featureOverrides });
  if (!entitlement.allowed || !["owner", "admin"].includes(a.company.role)) throw new OrganicAccessError("A análise de criativos exige acesso de gestão e recurso IA ativo no plano.", 403);
  return a;
}
function failure(e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : "Operação indisponível." }, { status: e instanceof OrganicAccessError ? e.status : 400 }); }
export async function GET(request: Request) {
  try { const a = await access(request); return NextResponse.json({ jobs: await creativeHistory(a.client, a.organizationId) }); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "meta-creative", maxPayloadBytes: 16000, rateLimit: { limit: 8, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });
  try {
    const a = await access(request);
    const raw = await request.text(); if (raw.length > 16000) throw Error("Instruções muito longas.");
    const b = JSON.parse(raw), brief = parseCreativeBrief(b);
    if (typeof b.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(b.requestId)) throw Error("Identificador da solicitação inválido.");
    return NextResponse.json({ jobs: await runCreativeJob(a.client, a.organizationId, a.workspace.user.id, b.requestId, brief) });
  } catch (e) { return failure(e); }
}
