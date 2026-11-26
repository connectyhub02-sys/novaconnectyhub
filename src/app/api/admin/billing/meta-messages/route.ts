import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { costCenterMonthRange, currentCostCenterMonth } from "@/lib/billing/cost-center-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const requested = request.nextUrl.searchParams.get("month");
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentCostCenterMonth();
  const { from, to } = costCenterMonthRange(month);
  const result = await createServiceClient().rpc("meta_message_billing_report", { p_from: from, p_to: to });
  if (result.error) return json({ error: "Relatório do WhatsApp oficial indisponível. Confira a migration 0228." }, 503);
  return json({ month, ...result.data });
}

// Admin changes: a sender's billing mode, a new Meta rate, or a manual balance adjustment.
export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const client = createServiceClient();
  if (body?.action === "billing_mode") {
    if (typeof body.phoneNumberId !== "string" || !/^\d{5,30}$/.test(body.phoneNumberId)) return json({ error: "Número inválido." }, 400);
    if (body.mode === "connectyhub_credit_line" && body.confirmCreditLine !== true)
      return json({ error: "Confirme que a linha de crédito da ConnectyHub já foi compartilhada com a conta WhatsApp deste número." }, 400);
    const result = await client.rpc("set_meta_whatsapp_billing_mode", { p_phone_number_id: body.phoneNumberId, p_mode: body.mode, p_actor: auth.userId });
    return result.error ? json({ error: "Não foi possível alterar o faturamento deste número." }, 422) : json({ ok: true });
  }
  if (body?.action === "rate") {
    const cost = Number(body.providerCostBrl), multiplier = Number(body.multiplier ?? 2), from = new Date(String(body.effectiveFrom ?? ""));
    if (!Number.isFinite(cost) || !Number.isFinite(multiplier) || !Number.isFinite(from.getTime())) return json({ error: "Informe custo, multiplicador e início da vigência." }, 400);
    const result = await client.rpc("set_meta_message_rate", { p_market: String(body.market ?? "BR").toUpperCase(), p_category: String(body.category ?? ""), p_cost: cost, p_multiplier: multiplier, p_from: from.toISOString(), p_source: String(body.source ?? "Admin").slice(0, 200), p_actor: auth.userId });
    if (result.error) return json({ error: result.error.message.includes("NOT_LATEST") ? "Já existe uma tarifa com vigência igual ou posterior para esta categoria." : "Tarifa inválida." }, 422);
    return json({ ok: true, id: result.data });
  }
  if (body?.action === "adjustment") {
    const amount = Number(body.amountBrl);
    if (typeof body.organizationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.organizationId) || !Number.isFinite(amount) || amount <= 0 || String(body.reason ?? "").trim().length < 5)
      return json({ error: "Informe empresa, valor positivo e motivo do ajuste." }, 400);
    const result = await client.rpc("credit_meta_message_wallet", { p_org: body.organizationId, p_amount: amount, p_reference: `admin_adjustment:${crypto.randomUUID()}`, p_description: `Ajuste admin: ${String(body.reason).trim().slice(0, 160)}`, p_actor: auth.userId, p_type: "adjustment", p_metadata: {} });
    return result.error ? json({ error: "Não foi possível creditar o saldo." }, 422) : json({ ok: true, ...result.data });
  }
  return json({ error: "Ação inválida." }, 400);
}
