import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContractAccess } from "@/lib/billing/contract-access";
import { billingLocalDate } from "@/lib/billing/commercial-terms";
import { managedRenewalDay } from "@/lib/billing/managed-renewal-policy";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";
import {
  AsaasDirectError,
  createManagedAsaasInvoice,
  payManagedAsaasInvoice,
} from "@/lib/sales-catalog/asaas-direct";
import {
  loadTransparentCheckout,
  resolveTransparentConnection,
  finishTransparentAttempt,
  directPaymentState,
  validateTransparentInventory,
} from "@/lib/sales-catalog/transparent-checkout";
import {
  loadCheckoutDelivery,
  saveCheckoutDelivery,
} from "@/lib/sales-catalog/checkout-delivery";
import {
  normalizeCurrencyAmount,
  getAppBaseUrl,
} from "@/lib/sales-catalog/mercado-pago";
import { loadStoreRecurringCard } from "./store-card-vault";
import { handleSalesCatalogPaymentStatusChange } from "@/lib/sales-catalog/post-payment";

export async function processStoreRenewals(
  client: SupabaseClient,
  now = new Date(),
) {
  const agreements = await client
    .from("commercial_agreements")
    .select("id,organization_id,lead_id,period_end,paid_cycles,metadata")
    .eq("owner_type", "store")
    .in("state", ["active", "past_due"])
    .eq("cancel_at_period_end", false)
    .eq("metadata->>recurring", "true")
    .lte("period_end", new Date(now.getTime() + 3 * 86400000).toISOString())
    .order("last_renewal_checked_at", { ascending: true, nullsFirst: true })
    .limit(30);
  if (agreements.error)
    throw new Error("Não foi possível consultar as renovações das lojas.");
  let prepared = 0,
    attempted = 0;
  for (const agreement of agreements.data) {
    try {
      if (!(await getContractAccess(agreement.organization_id, client)).allowed)
        continue;
      const result = await client.rpc("prepare_store_contract_period", {
        p_agreement: agreement.id,
        p_now: now.toISOString(),
      });
      if (result.error)
        throw new Error("Não foi possível preparar a próxima cobrança.");
      if (!result.data) continue;
      const orderId = result.data as string;
      prepared++;
      const connection = await resolveTransparentConnection(
        client,
        agreement.organization_id,
        orderId,
      );
      const card = await loadStoreRecurringCard(
        client,
        connection,
        agreement.organization_id,
        agreement.id,
      );
      const sessions = await client
        .from("sales_catalog_payment_sessions")
        .select("id,status,metadata")
        .eq("order_id", orderId)
        .eq("organization_id", agreement.organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sessions.error)
        throw new Error("Não foi possível consultar a cobrança de renovação.");
      let sessionId = sessions.data?.id as string | undefined;
      if (!sessionId) {
        await createSalesCatalogPixPaymentSession({
          client,
          organizationId: agreement.organization_id,
          orderId,
          source: "checkout",
          preferredMethod: card ? "card" : "pix",
          deferProvider: true,
        });
        const created = await client
          .from("sales_catalog_payment_sessions")
          .select("id")
          .eq("order_id", orderId)
          .eq("organization_id", agreement.organization_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (created.error)
          throw new Error("Não foi possível consultar a nova cobrança.");
        sessionId = created.data.id as string;
      }
      const freshDelivery = await loadCheckoutDelivery(client, sessionId);
      const freshQuote = freshDelivery.quotes.find(
        (q) => q.id === freshDelivery.selectedId,
      );
      if (
        freshDelivery.physical &&
        freshQuote &&
        freshQuote.amount !==
          (normalizeCurrencyAmount(
            freshDelivery.snapshot.order.shipping_total,
          ) ?? 0)
      ) {
        await saveCheckoutDelivery(client, sessionId, {
          revision: freshDelivery.revision,
          customer: freshDelivery.customer,
          serviceId: freshQuote.id,
        });
        const updated = await client
          .from("sales_catalog_orders")
          .update({
            metadata: {
              ...freshDelivery.snapshot.order.metadata,
              auto_charge_disabled: true,
              renewal: true,
            },
          })
          .eq("id", orderId)
          .eq("organization_id", agreement.organization_id);
        if (updated.error)
          throw new Error("O frete precisa de uma confirmação no checkout.");
      }
      // A notice is independent of the permission to debit a stored card.
      if (
        !["error", "failed", "cancelled", "expired"].includes(
          sessions.data?.status ?? "",
        )
      )
        await recordStoreRenewalNotice(
          client,
          agreement,
          orderId,
          sessionId,
          `${getAppBaseUrl()}/checkout/${sessionId}`,
        );
      if (!card || !managedRenewalDay(agreement.period_end, now)) continue;
      const snapshot = await loadTransparentCheckout(client, sessionId);
      if (snapshot.order.metadata?.auto_charge_disabled === true) continue;
      if (
        !snapshot.enabled ||
        (snapshot.settings &&
          !snapshot.settings.asaas.enabledMethods.includes("credit_card"))
      )
        continue;
      if (
        snapshot.review ||
        snapshot.order.payment_status === "confirmed" ||
        (snapshot.attempt &&
          ["processing", "unknown", "pending"].includes(snapshot.attempt.state))
      )
        continue;
      await validateTransparentInventory(
        client,
        agreement.organization_id,
        snapshot.items,
        snapshot.settings?.trackInventory ?? false,
      );
      const delivery = await loadCheckoutDelivery(client, sessionId);
      const selected = delivery.quotes.find(
        (q) => q.id === delivery.selectedId,
      );
      if (
        delivery.physical &&
        (!selected ||
          selected.amount !==
            (normalizeCurrencyAmount(snapshot.order.shipping_total) ?? 0))
      )
        throw new Error(
          "O frete mudou ou precisa ser confirmado. Confira a entrega no checkout antes de renovar.",
        );
      const claim = await client.rpc("claim_store_recurring_attempt", {
        p_agreement: agreement.id,
        p_session: sessionId,
        p_attempt: randomUUID(),
        p_revision: Number(snapshot.order.checkout_revision),
        p_amount: snapshot.amount,
        p_now: now.toISOString(),
      });
      if (claim.error)
        throw new Error("Não foi possível reservar a tentativa.");
      if (!claim.data?.claimed) continue;
      attempted++;
      const attempt = claim.data.attempt as { id: string };
      try {
        const reference = `checkout_card:${attempt.id}`;
        const invoice = await createManagedAsaasInvoice({
          ...connection,
          customerId: card.customerId,
          amount: snapshot.amount,
          dueDate: billingLocalDate(new Date(agreement.period_end)),
          reference,
        });
        const payment = await payManagedAsaasInvoice({
          ...connection,
          paymentId: invoice.id!,
          reference,
          customerId: card.customerId,
          token: card.token,
          amount: snapshot.amount,
        });
        await finishTransparentAttempt(
          client,
          attempt.id,
          directPaymentState(payment),
          payment,
        );
      } catch (error) {
        const definitive =
          error instanceof AsaasDirectError && error.definitive;
        await finishTransparentAttempt(
          client,
          attempt.id,
          definitive ? (error.declined ? "rejected" : "error") : "unknown",
          undefined,
          error instanceof AsaasDirectError ? error.diagnostic : undefined,
        );
      }
    } catch (error) {
      const recorded = await client.from("commercial_events").upsert(
        {
          organization_id: agreement.organization_id,
          lead_id: agreement.lead_id,
          agreement_id: agreement.id,
          event_key: `renewal-review:${agreement.id}:${agreement.paid_cycles}:${billingLocalDate(now)}`,
          event_type: "renewal_needs_review",
          payload: {
            notice:
              error instanceof Error
                ? error.message
                : "Renovação precisa de conferência.",
          },
        },
        { onConflict: "event_key", ignoreDuplicates: true },
      );
      if (recorded.error)
        throw new Error(
          "Não foi possível registrar a conferência da renovação.",
        );
    } finally {
      const checked = await client
        .from("commercial_agreements")
        .update({ last_renewal_checked_at: now.toISOString() })
        .eq("id", agreement.id)
        .eq("organization_id", agreement.organization_id);
      if (checked.error)
        throw new Error(
          "Não foi possível registrar a verificação da assinatura.",
        );
    }
  }
  return { prepared, attempted };
}
async function recordStoreRenewalNotice(
  client: SupabaseClient,
  agreement: {
    id: string;
    organization_id: string;
    lead_id: string | null;
    paid_cycles: number;
  },
  orderId: string,
  sessionId: string,
  checkoutUrl: string,
) {
  const event = await client.from("commercial_events").upsert(
    {
      organization_id: agreement.organization_id,
      lead_id: agreement.lead_id,
      agreement_id: agreement.id,
      event_key: `renewal-ready:${agreement.id}:${agreement.paid_cycles}`,
      event_type: "renewal_ready",
      payload: {
        order_id: orderId,
        checkout_url: checkoutUrl,
        notice: "A próxima cobrança da assinatura está disponível no checkout.",
      },
    },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  if (event.error)
    throw new Error(
      "Não foi possível registrar a cobrança no arquivo do lead.",
    );
  await handleSalesCatalogPaymentStatusChange({
    client,
    organizationId: agreement.organization_id,
    orderId,
    paymentSessionId: sessionId,
    providerPaymentId: null,
    paymentMethod: "renewal",
    paymentMethodLabel: "Renovação da assinatura",
    status: "pending",
    source: "checkout_card",
  });
}
