import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { refreshLeadOrderFinance } from "@/lib/sales-catalog/payment-reviews";
export const dynamic = "force-dynamic";
const uuid = /^[a-f0-9-]{36}$/i;
async function authorize(companyId: string, leadId: string) {
  const workspace = await getCurrentWorkspace();
  if (!workspace || !uuid.test(companyId) || !uuid.test(leadId)) throw new Error("ACCESS_DENIED");
  const client = createServiceClient();
  const company = workspace.profile.isPlatformAdmin ? null : await requireClientCompanyAccess({ client, companyId, userId: workspace.user.id });
  const lead = await client.from("leads").select("id").eq("id", leadId).eq("organization_id", companyId).maybeSingle();
  if (!lead.data) throw new Error("ACCESS_DENIED");
  return { client, workspace, canResolve: workspace.profile.isPlatformAdmin || ["owner", "admin"].includes(company?.role ?? "") };
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId") ?? "", leadId = params.get("leadId") ?? "";
  try {
    const { client, canResolve } = await authorize(companyId, leadId);
    let archiveQuery = client.from("lead_message_archive").select("id, message_id, operation, created_at, media_status, last_error, snapshot").eq("organization_id", companyId).eq("lead_id", leadId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(26);
    const cursor = params.get("cursor");
    if (cursor) {
      const [at, id] = cursor.split("|");
      if (!Number.isNaN(Date.parse(at)) && uuid.test(id ?? "")) archiveQuery = archiveQuery.or(`created_at.lt.${new Date(at).toISOString()},and(created_at.eq.${new Date(at).toISOString()},id.lt.${id})`);
    }
    const [reviews, archive] = await Promise.all([
      client.from("sales_catalog_payment_reviews").select("id, order_id, status, notification_status, requested_at, resolved_at, resolution, verification_reference, resolution_notice_state").eq("organization_id", companyId).eq("lead_id", leadId).order("requested_at", { ascending: false }).limit(50), archiveQuery,
    ]);
    if (reviews.error || archive.error) throw new Error("READ_FAILED");
    const rows = (archive.data ?? []).slice(0, 25);
    const last = rows[rows.length - 1];
    return NextResponse.json({ canResolve, reviews: reviews.data, archive: rows.map(row => ({ ...row, snapshot: undefined, text: row.snapshot?.text_content ?? null, direction: row.snapshot?.direction, messageType: row.snapshot?.message_type })), cursor: (archive.data?.length ?? 0) > 25 && last ? `${last.created_at}|${last.id}` : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Não foi possível consultar o arquivo do lead neste acesso." }, { status: 403 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client, workspace, canResolve } = await authorize(String(body.companyId ?? ""), String(body.leadId ?? ""));
    if (!canResolve) return NextResponse.json({ error: "A conferência deve ser concluída por um administrador da empresa." }, { status: 403 });
    const reference = String(body.reference ?? "").trim();
    if (reference.length < 5 || reference.length > 500 || /(?:\d[ -]?){16,19}/.test(reference)) return NextResponse.json({ error: "Registre a referência da consulta ao financeiro, sem dados de cartão." }, { status: 400 });
    const result = await client.from("sales_catalog_payment_reviews").select("id, order_id").eq("id", body.reviewId).eq("organization_id", body.companyId).eq("lead_id", body.leadId).maybeSingle();
    if (!result.data) throw new Error("ACCESS_DENIED");
    if (result.data.order_id) await refreshLeadOrderFinance(client, body.companyId, body.leadId, result.data.order_id);
    const resolved = await client.rpc("resolve_checkout_payment_review", { p_review_id: result.data.id, p_organization_id: body.companyId, p_actor_id: workspace.user.id, p_resolution: body.resolution, p_reference: reference });
    if (resolved.error) return NextResponse.json({ error: "Não foi possível encerrar: confirme o estado do pedido no processador e aguarde tentativas ainda em verificação." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Não foi possível concluir a conferência neste acesso." }, { status: 403 }); }
}
