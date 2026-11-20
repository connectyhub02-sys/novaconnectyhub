import { NextResponse } from "next/server";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBillableAccess } from "@/lib/billing/trial";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { googleStoreTagFromRow, parseGoogleStoreTag, type GoogleStoreTagRow } from "@/lib/google/store-tag-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function access(request: Request, write = false) {
  const requested = new URL(request.url).searchParams.get("companyId");
  const workspace = requested ? await getCurrentWorkspace() : await getMetaWorkspace();
  if (!workspace) throw new Error("Sessão obrigatória.");
  const companyId = requested ? resolveDashboardCompanyId({ workspace, requestedCompanyId: requested }) : workspace.organization?.id;
  if (!companyId) throw new Error("Selecione a empresa.");
  const client = createServiceClient();
  const company = await requireMetaCompanyAccess({ client, userId: workspace.user.id, companyId });
  if (write) {
    if (!["owner", "admin"].includes(company.role)) throw new Error("Somente administradores podem configurar a tag do Google.");
    await assertBillableAccess({ client, organizationId: company.id });
  }
  return { client, organizationId: company.id, userId: workspace.user.id };
}

export async function GET(request: Request) {
  try {
    const { client, organizationId } = await access(request);
    const row = await client.from("google_store_tags").select("measurement_id,ads_conversion_id,lead_label,enabled").eq("organization_id", organizationId).maybeSingle();
    if (row.error) throw new Error("Não foi possível consultar a tag do Google.");
    return json({ tag: googleStoreTagFromRow(row.data as GoogleStoreTagRow | null) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha de acesso." }, 403);
  }
}

export async function POST(request: Request) {
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "google-store-tag", maxPayloadBytes: 2048, rateLimit: { limit: 30, windowMs: 60000 } });
  if (!guard.ok) return json({ error: guard.message }, guard.status);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON obrigatório." }, 415);
  let ctx;
  try {
    ctx = await access(request, true);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha de acesso." }, 403);
  }
  try {
    const tag = parseGoogleStoreTag(await request.json());
    const saved = await ctx.client.from("google_store_tags").upsert({
      organization_id: ctx.organizationId,
      measurement_id: tag.measurementId,
      ads_conversion_id: tag.adsConversionId,
      lead_label: tag.leadLabel,
      enabled: tag.enabled,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    });
    if (saved.error) throw new Error("Não foi possível salvar a tag do Google.");
    return json({ tag });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Dados inválidos." }, 422);
  }
}
