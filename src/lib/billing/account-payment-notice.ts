import { buildBillingPaymentFailureCopy } from "./payment-feedback";
import type { PaymentDiagnostic } from "../sales-catalog/payment-diagnostics";

export type AccountCardAttempt = { state: string; diagnostic: Partial<PaymentDiagnostic> | null; created_at: string };
export type AccountPaymentNotice = { message: string; recommendation: string; attemptedAt: string };

/** The API supplies only the latest attempt, scoped to the workspace/payment. */
export function accountPaymentNotice(status: string, provider: string | null, attempt?: AccountCardAttempt): AccountPaymentNotice | null {
  if (!attempt || status !== "rejected" || !["rejected", "error"].includes(attempt.state)) return null;
  const copy = buildBillingPaymentFailureCopy(provider === "asaas" || provider === "pagbank" || provider === "mercado_pago" ? provider : "unknown", attempt.state, attempt.diagnostic);
  // Return safe copy only, never provider payloads, codes or private identifiers.
  return { message: copy.description, recommendation: copy.recommendation, attemptedAt: attempt.created_at };
}
