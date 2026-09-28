import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { debitCredits, type BillingProvider } from "./cost-center";

// A usage recorded as completed but whose run stopped before the debit is settled after this grace period,
// so a debit still in flight is never raced.
const interruptedDebitGraceMs = 10 * 60 * 1000;
const interruptedDebitLookbackMs = 48 * 60 * 60 * 1000;

type PendingDebitRow = { id: string; organization_id: string; provider: string; connecty_charge_credits: number | string };

async function settle(client: SupabaseClient, row: PendingDebitRow, description: string) {
  await debitCredits(client, {
    organizationId: row.organization_id, usageEventId: row.id,
    provider: row.provider as BillingProvider, amountCredits: Number(row.connecty_charge_credits),
    description,
    metadata: { reconciliation: true, suppressTrialNotification: true },
  });
}

/** Retry only newly marked, priced usage; never reprice historical free usage. */
export async function reconcileUsageDebits(client: SupabaseClient) {
  const { data, error } = await client.from("usage_events")
    .select("id,organization_id,provider,connecty_charge_credits")
    .eq("status", "pending").in("billing_mode", ["customer_billable", "trial_billable"])
    .gt("connecty_charge_credits", 0).not("debit_retry_at", "is", null)
    .lte("debit_retry_at", new Date().toISOString()).order("debit_retry_at").limit(100);
  if (error) throw new Error("Não foi possível consultar os débitos pendentes.");
  let completed = 0, pending = 0;
  for (const row of data ?? []) {
    try {
      await settle(client, row, "Conclusão de consumo em conferência");
      completed++;
    } catch {
      const updated = await client.from("usage_events")
        .update({ debit_retry_at: new Date(Date.now() + 60 * 60000).toISOString() })
        .eq("id", row.id).eq("status", "pending");
      if (updated.error) throw new Error("Não foi possível reagendar a conferência do consumo.");
      pending++;
    }
  }
  const interrupted = await settleInterruptedDebits(client);
  return { completed, pending, ...interrupted };
}

/**
 * Priced usage recorded as completed but never debited: the run ended between recording and debiting.
 * The debit is idempotent per usage event, so an event already debited only gets its link back.
 */
export async function settleInterruptedDebits(client: SupabaseClient, options: { lookbackMs?: number } = {}) {
  const now = Date.now();
  const pageSize = 1000;
  const pending: PendingDebitRow[] = [];
  // Older debits were recorded without the link on the usage event: those already have a debit and are skipped.
  for (let offset = 0; offset < 20 * pageSize && pending.length < 100; offset += pageSize) {
    const { data, error } = await client.from("usage_events")
      .select("id,organization_id,provider,connecty_charge_credits")
      .eq("status", "completed").in("billing_mode", ["customer_billable", "trial_billable"])
      .gt("connecty_charge_credits", 0)
      .is("metadata->>debit_transaction_id", null)
      .gte("occurred_at", new Date(now - (options.lookbackMs ?? interruptedDebitLookbackMs)).toISOString())
      .lte("occurred_at", new Date(now - interruptedDebitGraceMs).toISOString())
      .order("occurred_at").order("id").range(offset, offset + pageSize - 1);
    if (error) throw new Error("Não foi possível consultar consumos sem débito.");
    const rows = (data ?? []) as PendingDebitRow[];
    const debitedIds = new Set<string>();
    for (let index = 0; index < rows.length; index += 200) {
      const { data: debits, error: debitError } = await client.from("credit_transactions")
        .select("usage_event_id").eq("transaction_type", "debit").in("usage_event_id", rows.slice(index, index + 200).map(row => row.id));
      if (debitError) throw new Error("Não foi possível conferir os débitos existentes.");
      for (const debit of debits ?? []) if (debit.usage_event_id) debitedIds.add(debit.usage_event_id);
    }
    pending.push(...rows.filter(row => !debitedIds.has(row.id)));
    if (rows.length < pageSize) break;
  }
  let settled = 0, failed = 0;
  for (const row of pending.slice(0, 100)) {
    try {
      await settle(client, row, "Conclusão de consumo interrompido");
      settled++;
    } catch {
      failed++;
    }
  }
  return { interruptedSettled: settled, interruptedFailed: failed };
}
