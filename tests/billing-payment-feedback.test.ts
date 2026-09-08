import { describe, expect, it } from "vitest";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { buildBillingPaymentFailureCopy } from "../src/lib/billing/payment-feedback";
import { classifyAsaasFailure } from "../src/lib/sales-catalog/payment-diagnostics";
import { serverModuleHarness } from "./helpers/server-module-harness";

describe("checkout payment feedback", () => {
  it("preserves a safe tokenization permission diagnostic without the provider body", () => {
    const diagnostic = classifyAsaasFailure(403, "/creditCard/tokenizeCreditCard", "POST", {errors:[{code:"forbidden",description:"Sensitive submitted data"}]});
    expect(diagnostic).toEqual({category:"integration",stage:"card_tokenization",code:"forbidden",httpStatus:403});
    expect(JSON.stringify(diagnostic)).not.toContain("Sensitive");
  });
  it("handles the previously stored 403 without claiming a bank refusal", () => {
    const copy = buildBillingPaymentFailureCopy("asaas", "error", {category:"integration",stage:"reconcile",code:"not_informed",httpStatus:403});
    expect(copy).toMatchObject({label:"Cartão indisponível",retryCardAllowed:false});
    expect(copy.description).toContain("Asaas");
    expect(copy.description).not.toMatch(/Mercado Pago|banco|saldo/);
  });
  it.each(["asaas", "pagbank", "unknown"] as const)("does not default %s to Mercado Pago or infer a decline", provider => {
    const copy = buildBillingPaymentFailureCopy(provider, "rejected");
    expect(JSON.stringify(copy)).not.toMatch(/Mercado Pago|Pagamento recusado|Nenhuma cobrança/);
  });
  it("reserves refused wording for an actual charge decline", () => {
    const copy = buildBillingPaymentFailureCopy("asaas", "rejected", classifyAsaasFailure(400,"/payments","POST",{errors:[{code:"invalid_creditCard"}]}));
    expect(copy.label).toBe("Pagamento recusado");
    expect(copy.retryCardAllowed).toBe(true);
    expect(copy.description).not.toMatch(/saldo|limite/);
  });
  it("renders the actual billing modal with provider failure and a non-retry action", () => {
    const { CheckoutPaymentFeedbackModal } = serverModuleHarness<{CheckoutPaymentFeedbackModal: React.ComponentType<Record<string,unknown>>}>("src/components/connectyhub-os/billing-plan-checkout.tsx", {
      react:React,"react/jsx-runtime":jsx,"lucide-react":icons,"@/lib/utils":{cn:(...values:unknown[])=>values.filter(Boolean).join(" ")},
    }, ["CheckoutPaymentFeedbackModal"]);
    const rejection=buildBillingPaymentFailureCopy("asaas","error",{category:"integration",httpStatus:403});
    const html=renderToStaticMarkup(React.createElement(CheckoutPaymentFeedbackModal,{feedback:{kind:"rejected",rejection},onClose:()=>{},onRetryCard:()=>{},onUsePix:()=>{},onGoDashboard:()=>{}}));
    expect(html).toContain("Cartão indisponível");
    expect(html).toContain("Asaas");
    expect(html).toContain("Entendi");
    expect(html).not.toMatch(/Mercado Pago|Pagamento recusado|Tentar outro cartao|Nenhuma cobranca/);
  });
});
