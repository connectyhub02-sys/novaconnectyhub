import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retireCheckoutPaymentsBeforeCartChange } from "./transparent-checkout";
import { normalizeCurrencyAmount } from "./mercado-pago";

export type SalesCatalogOrderRevisionRow = {
  catalog_item_id: string;
  organization_id?: string;
  order_id?: string;
  sku_id?: string | null;
  sku_code?: string | null;
  title: string;
  tag?: string | null;
  quantity: number;
  unit_price: string | number | null;
  sale_price?: string | number | null;
  total: string | number | null;
  attributes?: unknown;
  fulfillment?: unknown;
  metadata?: Record<string, unknown>;
  product_origin_type?: string | null;
  commercial_flow_type?: string | null;
  revenue_owner_type?: string | null;
  commission_eligible?: boolean | null;
  platform_product_id?: string | null;
};

export type SalesCatalogOrderRevisionInput = {
  client: SupabaseClient;
  organizationId: string;
  leadId: string;
  conversationId: string;
  orderId: string;
  expectedRevision: number;
  /** Persisted proposal ID, retained across job retries. Never use a new ID on retry. */
  requestId: string;
  rows: SalesCatalogOrderRevisionRow[];
  shipping: { total: number | string; method: string | null; destinationCep: string | null; destinationAddress: string | null };
  expectedTotal: number | string;
  preferredPaymentMethod?: "pix" | "card" | null;
};

export type RevisedSalesCatalogOrder = Record<string, unknown> & {
  id: string;
  organization_id: string;
  lead_id: string;
  conversation_id: string;
  checkout_revision: number;
  total: string;
};

export class SalesCatalogOrderRevisionError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "SalesCatalogOrderRevisionError"; }
}

function revisionError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  const code = message.match(/CHECKOUT_[A-Z_]+/)?.[0] ?? "CHECKOUT_REVISION_UNAVAILABLE";
  const copy = code === "CHECKOUT_CHANGED" || code === "CHECKOUT_REVISION_CONFLICT"
    ? "O pedido mudou desde a confirmação. Vou conferir a alteração e apresentar o total atualizado."
    : code === "CHECKOUT_CLOSED"
      ? "Este pedido já avançou para pagamento ou atendimento e precisa de conferência antes de ser alterado."
      : code === "CHECKOUT_FINANCIAL_REVIEW" || code === "CHECKOUT_REVISION_BLOCKED"
        ? "Há uma conferência de pagamento pendente. A alteração aguarda essa verificação."
        : /BUSY|PENDING/.test(code)
          ? "Há um pagamento ou uma alteração em processamento. Aguarde a confirmação antes de alterar o pedido."
          : code === "CHECKOUT_NOT_FOUND"
            ? "Não foi possível localizar o pedido desta conversa."
            : "Não foi possível confirmar os itens e o total da alteração. O pedido ainda não foi atualizado.";
  return new SalesCatalogOrderRevisionError(code, copy);
}

/** Called only after the customer confirms the exact persisted proposal. */
export async function applySalesCatalogOrderRevision(input: SalesCatalogOrderRevisionInput): Promise<RevisedSalesCatalogOrder> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !input.requestId.trim() || input.requestId.length > 200
    || !input.leadId || !input.conversationId || !input.rows.length || input.rows.length > 100
    || input.rows.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 100000
      || row.organization_id && row.organization_id !== input.organizationId || row.order_id && row.order_id !== input.orderId)) {
    throw revisionError(new Error("CHECKOUT_INVALID_CART"));
  }
  const shipping = typeof input.shipping.total === "string" && /^\s*(?:R\$\s*)?0+(?:[.,]0+)?\s*$/.test(input.shipping.total)
    ? 0 : normalizeCurrencyAmount(input.shipping.total);
  const total = normalizeCurrencyAmount(input.expectedTotal);
  if (shipping === null || shipping < 0 || total === null || total <= 0) throw revisionError(new Error("CHECKOUT_INVALID_TOTAL"));
  const claimToken = randomUUID();
  const payload = {
    rows: input.rows,
    shipping: { total: shipping, method: input.shipping.method, destination_cep: input.shipping.destinationCep, destination_address: input.shipping.destinationAddress },
    expected_total: total,
    preferred_payment_method: input.preferredPaymentMethod ?? null,
  };
  const { data: claim, error: claimError } = await input.client.rpc("begin_sales_catalog_order_revision", {
    p_order_id: input.orderId, p_organization_id: input.organizationId, p_lead_id: input.leadId, p_conversation_id: input.conversationId,
    p_revision: input.expectedRevision, p_request_id: input.requestId, p_claim_token: claimToken, p_payload: payload,
  });
  if (claimError || !claim) throw revisionError(claimError);
  // Completion is checked by the database before revision/financial state. A retry must
  // never cancel a payment subsequently created for the already revised order.
  if (claim.replay === true && claim.order) return claim.order as RevisedSalesCatalogOrder;
  if (claim.claimed !== true) throw revisionError(new Error("CHECKOUT_REVISION_BUSY"));
  let retirementStarted = false;
  try {
    if (claim.needs_retirement === true) {
      retirementStarted = true;
      await retireCheckoutPaymentsBeforeCartChange(input.client, input.organizationId, input.orderId);
    }
    const { data: order, error } = await input.client.rpc("finish_sales_catalog_order_revision", {
      p_order_id: input.orderId, p_organization_id: input.organizationId, p_request_id: input.requestId, p_claim_token: claimToken,
    });
    if (error || !order) throw error ?? new Error("CHECKOUT_REVISION_UNAVAILABLE");
    return order as RevisedSalesCatalogOrder;
  } catch (error) {
    // Do not release an uncertain retirement. The previous payable amount must be
    // reconciled before either this revision or another payment is allowed.
    await input.client.rpc("fail_sales_catalog_order_revision", {
      p_order_id: input.orderId, p_organization_id: input.organizationId, p_request_id: input.requestId, p_claim_token: claimToken,
      p_uncertain: retirementStarted,
    }).then(() => undefined, () => undefined);
    throw retirementStarted ? revisionError(new Error("CHECKOUT_REVISION_BLOCKED")) : revisionError(error);
  }
}
