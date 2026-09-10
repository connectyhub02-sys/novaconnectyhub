import { expect, it } from "vitest";
import { renderAccountNoticeVoice } from "../src/lib/billing/account-notice-voice";

const base = { senderKind: "customer" as const, agentName: "Ana", eventType: "paid_low_credits_20", platformMessage: "Sua conta está com saldo baixo.", metadata: { balance_credits: 1000, checkout_url: "https://fixture.invalid/dashboard/creditos" } };
it("uses first person while accurately describing a shared wallet and a conditional pause", () => {
  const message = renderAccountNoticeVoice(base);
  expect(message).toContain("Sou Ana, seu assistente virtual.");
  expect(message).toContain("Estou ficando sem combustível");
  expect(message).toContain("1.000 créditos no saldo compartilhado");
  expect(message).toContain("Se esse saldo acabar");
  expect(message).not.toContain("já já");
  expect(message).toContain(base.metadata.checkout_url);
});
it("does not fabricate a remaining balance for a legacy event", () => {
  const message = renderAccountNoticeVoice({ ...base, metadata: {} });
  expect(message).toContain("saldo compartilhado da sua conta está baixo");
  expect(message).not.toContain("Restam");
});
it.each(["paid_low_credits_20", "paid_no_credits", "payment_approved", "credit_topup_enabled"])("keeps the platform's original voice for %s", eventType => {
  expect(renderAccountNoticeVoice({ ...base, eventType, senderKind: "platform" })).toBe(base.platformMessage);
});
it.each(["payment_pending", "payment_approved", "payment_rejected", "payment_canceled", "payment_refunded", "credit_topup_enabled", "credit_topup_action_required", "paid_plan_one_day_remaining", "subscription_canceled"])("preserves dates, money, instructions and custom copy for %s", eventType => {
  const platformMessage = "Titular, confira a atualização: R$ 47,00, 5.000 créditos, 10/09/2026. Não repita a cobrança. https://fixture.invalid/checkout";
  const message = renderAccountNoticeVoice({ ...base, eventType, platformMessage });
  expect(message).toContain("Sou Ana, seu assistente virtual.");
  expect(message.endsWith(platformMessage)).toBe(true);
});
