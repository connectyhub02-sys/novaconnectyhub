import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = Record<string, unknown>;

const record = (value: unknown): Body | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Body : null);
const positive = (value: unknown, max: number) => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : null;
};

// Editable inputs of the monthly cost center: reference USD/BRL rate and fixed costs.
// Never touches tariffs, wallets or past usage.
export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = record(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Envie os dados em JSON." }, { status: 400 });
  const client = createServiceClient();
  const now = new Date().toISOString();

  const fx = record(body.fx);
  if (fx) {
    const rate = positive(fx.rate, 50);
    if (!rate) return NextResponse.json({ error: "Informe a cotação do dólar em reais." }, { status: 400 });
    const asOf = now.slice(0, 10);
    const { error } = await client.from("cost_center_settings").upsert({
      setting_key: "usd_brl_reference",
      value: { rate, as_of: asOf, source: "Atualizado no Financeiro" },
      updated_at: now,
      updated_by: auth.userId,
    });
    if (error) return NextResponse.json({ error: "Não foi possível salvar a cotação." }, { status: 500 });
    revalidatePath("/admin/financeiro");
    return NextResponse.json({ ok: true });
  }

  const fixed = record(body.fixedCost);
  if (fixed) {
    const costKey = typeof fixed.costKey === "string" ? fixed.costKey : "";
    const amount = fixed.monthlyAmount === 0 || fixed.monthlyAmount === "0" ? 0 : positive(fixed.monthlyAmount, 1_000_000);
    const currency = fixed.currency === "USD" || fixed.currency === "BRL" ? fixed.currency : null;
    const quota = fixed.quotaUnits === null || fixed.quotaUnits === "" || fixed.quotaUnits === undefined ? null : positive(fixed.quotaUnits, 1e12);
    if (!/^[a-z0-9_]{2,60}$/.test(costKey) || amount === null || !currency || (fixed.quotaUnits && quota === null)) {
      return NextResponse.json({ error: "Confira o valor, a moeda e a franquia." }, { status: 400 });
    }
    const { data, error } = await client.from("platform_fixed_costs")
      .update({ monthly_amount: amount, currency, quota_units: quota, active: fixed.active !== false, updated_at: now, updated_by: auth.userId })
      .eq("cost_key", costKey)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Não foi possível salvar o custo fixo." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Custo fixo não encontrado." }, { status: 404 });
    revalidatePath("/admin/financeiro");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
}
