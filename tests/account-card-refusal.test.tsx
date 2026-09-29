import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { classifyAsaasFailure } from "../src/lib/sales-catalog/payment-diagnostics";
import { accountPaymentNotice } from "../src/lib/billing/account-payment-notice";
import { SavedCardFields } from "../src/components/checkout/saved-card-fields";

const response = { errors: [{ code: "invalid_object", description: "Transação não autorizada, verifique o limite disponível no cartão." }] };
const diagnostic = classifyAsaasFailure(400, "/payments/pay_example/payWithCreditCard", "POST", response);
const attempt = { state: "rejected", diagnostic, created_at: "2026-09-29T16:47:00Z" };
describe("confirmed card refusal in the customer account", () => {
  it("recognizes the charge endpoint and stores only an allowlisted reason", () => {
    expect(diagnostic).toEqual({ stage: "payment_charge", category: "declined", code: "invalid_object", httpStatus: 400, reason: "check_card_limit" });
    expect(JSON.stringify(diagnostic)).not.toContain("Transação");
  });
  it.each(["/customers", "/creditCard/tokenizeCreditCard"])("does not treat %s validation as a bank refusal", endpoint => {
    expect(classifyAsaasFailure(400, endpoint, "POST", response).category).toBe("validation");
  });
  it("does not infer refusal from generic invalid_object or echo submitted private data", () => {
    const result = classifyAsaasFailure(400, "/payments/pay_example/payWithCreditCard", "POST", { errors: [{ code: "invalid_object", description: "Invalid private card/token NEVER_ECHO" }] });
    expect(result.category).toBe("validation"); expect(result.reason).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("NEVER_ECHO");
  });
  it("exposes safe guidance and the attempt date without inventing insufficient funds", () => {
    const notice = accountPaymentNotice("rejected", "asaas", attempt)!;
    expect(notice.message).toContain("orientou conferir o limite");
    expect(notice.recommendation).toContain("outro cartão");
    expect(notice.attemptedAt).toBe(attempt.created_at);
    expect(JSON.stringify(notice)).not.toMatch(/invalid_object|payment_charge|saldo insuficiente/);
  });
  it.each(["approved", "refunded", "in_process", "pending"])("suppresses an old refusal for payment %s", state => {
    expect(accountPaymentNotice(state, "asaas", attempt)).toBeNull();
  });
  it("does not present a prior failure as the result of a newer pending attempt", () => {
    expect(accountPaymentNotice("rejected", "asaas", { ...attempt, state: "pending" })).toBeNull();
    expect(accountPaymentNotice("rejected", "asaas")).toBeNull();
  });
  it("offers the same accessible card fields for registration and replacement", () => {
    const html = renderToStaticMarkup(<SavedCardFields />);
    for (const autocomplete of ["cc-number", "cc-name", "cc-exp", "cc-csc"]) expect(html).toContain(`autoComplete="${autocomplete}"`);
    expect(html).toContain('type="password"');
    expect(html).toContain("0000 0000 0000 0000");
    expect(html).toContain("Bandeiras aceitas");
    expect(html).not.toContain("4111111111111111");
  });
});
