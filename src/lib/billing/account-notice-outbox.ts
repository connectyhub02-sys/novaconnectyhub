import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type RecordValue = Record<string, unknown>;
export type AccountNoticeInput = {
  organizationId: string; subscriptionId: string | null; invoiceId: string | null; paymentId: string | null;
  planCode: string; planName: string; amountBrl: number; includedCredits: number;
  eventType: string; dedupeKey: string; providerStatus: string | null; providerReference: string | null; metadata: RecordValue;
};
type OutboxRow = { id: string; organization_id: string; payment_id: string | null; event_type: string; dedupe_key: string; metadata: RecordValue; attempts: number };
const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};

export async function processAccountBillingNoticeOutbox(client: SupabaseClient, enqueue: (input: AccountNoticeInput) => Promise<{ id: string } | null>, appUrl: string) {
  const due = await client.from("account_billing_notice_outbox").select("id,organization_id,payment_id,event_type,dedupe_key,metadata,attempts").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(100);
  if (due.error) throw new Error("Não foi possível consultar os avisos financeiros da conta.");
  let queued = 0;
  for (const row of (due.data ?? []) as OutboxRow[]) {
    try {
      const input = await loadOutboxNotice(client, row, appUrl);
      if (input) {
        const notice = await enqueue(input);
        if (!notice?.id) throw new Error("O aviso ainda não foi registrado.");
        queued++;
      }
      const done = await client.from("account_billing_notice_outbox").delete().eq("id", row.id);
      if (done.error) throw new Error("O registro do aviso será conferido novamente.");
    } catch {
      await client.from("account_billing_notice_outbox").update({ attempts: row.attempts + 1, next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(row.attempts, 6))).toISOString() }).eq("id", row.id);
    }
  }
  return { checked: due.data?.length ?? 0, queued };
}

async function loadOutboxNotice(client: SupabaseClient, row: OutboxRow, appUrl: string): Promise<AccountNoticeInput | null> {
  const base: AccountNoticeInput = { organizationId: row.organization_id, subscriptionId: null, invoiceId: null, paymentId: row.payment_id, planCode: "", planName: "Recarga de créditos", amountBrl: 0, includedCredits: 0, eventType: row.event_type, dedupeKey: row.dedupe_key, providerStatus: row.event_type, providerReference: null, metadata: { ...row.metadata, source: "account_notice_outbox", checkout_url: `${appUrl}/dashboard/creditos` } };
  if (row.payment_id) {
    const payment = await client.from("billing_payments").select("id,organization_id,subscription_id,invoice_id,status,amount_brl,payload").eq("id", row.payment_id).eq("organization_id", row.organization_id).single();
    if (payment.error || !payment.data) throw new Error("Pagamento do aviso indisponível.");
    const p = payment.data;
    if (row.event_type === "payment_refunded" ? p.status !== "refunded" : !["canceled", "cancelled"].includes(p.status)) return null;
    const terms = record(p.payload?.commercial_terms);
    base.subscriptionId = p.subscription_id; base.invoiceId = p.invoice_id;
    base.planCode = String(p.payload?.target_plan_code ?? "");
    base.planName = String(terms.name ?? "sua compra ConnectyHub");
    base.amountBrl = Number(p.amount_brl); base.includedCredits = Number(terms.included_credits ?? 0);
    base.metadata = { ...record(p.payload), source: "account_notice_outbox", checkout_url: `${appUrl}/dashboard/minha-conta` };
    return base;
  }
  const result = await client.from("credit_topup_policies").select("enabled,authorized_at,agreed_amount_brl,agreed_credits,threshold_credits,monthly_cap_brl,card_method_id").eq("organization_id", row.organization_id).maybeSingle();
  if (result.error) throw new Error("Autorização de recarga indisponível.");
  const p = result.data;
  if (!p || Date.parse(p.authorized_at) !== Date.parse(String(row.metadata.policy_authorized_at))) return null;
  if (row.event_type === "credit_topup_enabled" && !p.enabled) return null;
  if (row.event_type === "credit_topup_disabled" && p.enabled) return null;
  if (row.event_type === "credit_topup_action_required") {
    if (row.metadata.reason === "offer_changed" ? p.enabled : !p.enabled) return null;
    const wallet = await client.from("credit_wallets").select("balance_credits").eq("organization_id", row.organization_id).single();
    if (wallet.error) throw new Error("Saldo indisponível para conferir o aviso.");
    if (Number(wallet.data.balance_credits) > Number(p.threshold_credits)) return null;
    if (row.metadata.reason === "monthly_cap" && row.metadata.cap_month !== new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date())) return null;
    if (row.metadata.reason === "card_unavailable") {
      const card = await client.from("billing_asaas_card_vault").select("status").eq("id", p.card_method_id).eq("organization_id", row.organization_id).maybeSingle();
      if (card.error) throw new Error("Cartão indisponível para conferir o aviso.");
      if (card.data?.status === "active") return null;
    }
  }
  base.amountBrl = Number(p.agreed_amount_brl); base.includedCredits = Number(p.agreed_credits);
  base.metadata = { ...base.metadata, credit_amount: Number(p.agreed_credits), threshold_credits: Number(p.threshold_credits), monthly_cap_brl: Number(p.monthly_cap_brl) };
  return base;
}
