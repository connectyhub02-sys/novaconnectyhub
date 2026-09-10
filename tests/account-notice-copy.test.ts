import { expect, it } from "vitest";
import { accessPeriodNotice, accountNoticeMetadata, buildAccountCreditNotice, canonicalPaymentNoticeKey, subscriptionNoticeType } from "../src/lib/billing/account-notice-copy";

const base = "https://www.connectyhub.com.br";
it("does not announce pending payment when an active subscription is merely synchronized", () => {
  expect(subscriptionNoticeType("active")).toBe("billing_update");
  expect(subscriptionNoticeType("pending")).toBe("subscription_pending");
  expect(subscriptionNoticeType("canceled")).toBe("subscription_canceled");
  expect(subscriptionNoticeType("paused")).toBe("subscription_paused");
});
const payload = { purchase_kind: "product", automatic_topup: true, commercial_terms: { billing_cycle: "one_time", included_credits: 5000 }, checkout_url: "/dashboard/meus-produtos/checkout/example" };
it.each(["payment_approved", "payment_pending", "payment_canceled", "payment_refunded", "payment_rejected"])("describes a credit purchase correctly for %s", eventType => {
  const metadata = accountNoticeMetadata(payload, { checkout_url: "/dashboard/planos" }, base);
  expect(metadata).toMatchObject({ credit_topup: true, automatic_topup: true, credit_amount: 5000, checkout_public_url: `${base}/dashboard/creditos` });
  const copy = buildAccountCreditNotice({ eventType, amountBrl: 47, metadata }, "Cliente");
  expect(copy).toContain("recarga automática"); expect(copy).not.toContain("plano"); expect(copy).not.toContain("/meus-produtos");
  if (eventType === "payment_approved") expect(copy).toContain("5.000 créditos adicionados");
  else expect(copy).not.toContain("créditos adicionados");
});
it.each(["card_unavailable", "monthly_cap", "offer_changed"])("explains blocked recarga %s without claiming a charge", reason => {
  const message = buildAccountCreditNotice({ eventType: "credit_topup_action_required", amountBrl: 47, metadata: { reason, checkout_url: `${base}/dashboard/creditos` } }, "Cliente");
  expect(message).toContain("não realizou uma nova cobrança"); expect(message).toContain("precisa de atenção");
});
it("preserves plan notices and routes other product failures to their own checkout", () => {
  expect(accountNoticeMetadata({}, { checkout_url: "/dashboard/planos" }, base)).toEqual({ checkout_url: "/dashboard/planos" });
  expect(accountNoticeMetadata({ ...payload, automatic_topup: false, commercial_terms: { billing_cycle: "recurring", included_credits: 5000 } }, {}, base)).toMatchObject({ checkout_public_url: `${base}/dashboard/meus-produtos/checkout/example` });
});
it("does not turn a general credit-purchase update into a refusal", () => {
  const copy = buildAccountCreditNotice({ eventType: "billing_update", amountBrl: 47, metadata: accountNoticeMetadata(payload, {}, base) }, "Cliente");
  expect(copy).toContain("atualização");
  expect(copy).not.toContain("não foi possível");
  expect(copy).not.toContain("créditos adicionados");
});
it("deduplicates the same payment outcome across native checkout, webhook and reconciliation", () => {
  const native = canonicalPaymentNoticeKey("payment", "payment_refunded", "native:attempt");
  expect(native).toBe(canonicalPaymentNoticeKey("payment", "payment_refunded", "webhook:provider"));
  expect(native).not.toBe(canonicalPaymentNoticeKey("other-payment", "payment_refunded", "webhook:provider"));
});
it("informs the end of nonrenewing access without an invoice", () => {
  const end = new Date("2026-09-11T12:00:00Z");
  expect(accessPeriodNotice(end, new Date("2026-09-09T12:00:00Z"))).toBeNull();
  expect(accessPeriodNotice(end, new Date("2026-09-10T12:00:00Z"))).toBe("paid_access_ending");
  expect(accessPeriodNotice(end, end)).toBe("paid_access_ended");
  expect(accessPeriodNotice(null, end)).toBeNull();
});
