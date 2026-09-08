import { describe, expect, it } from "vitest";
import { billingCheckoutPresentation } from "../src/lib/billing/checkout-presentation";

describe("checkout presentation follows payment evidence", () => {
  it("never describes a declined, closed checkout as processing or paid", () => {
    const status = billingCheckoutPresentation("rejected", false, { label: "Pagamento recusado", description: "O provedor informou a recusa." });
    expect(status.title).toBe("Pagamento recusado");
    expect(status.description).toContain("novo pagamento");
    expect(status.tone).toBe("error");
  });
  it("does not turn an integration failure into a bank refusal", () => {
    expect(billingCheckoutPresentation("rejected", false, { label: "Cartão indisponível", description: "O provedor precisa liberar a integração." }).title).toBe("Cartão indisponível");
    expect(billingCheckoutPresentation("rejected", false).title).toBe("Pagamento não concluído");
  });
  it("only describes an explicitly approved payment as confirmed", () => {
    for (const status of ["cancelled", "refunded", "unknown", "pending"]) {
      expect(billingCheckoutPresentation(status, false).title).toBe("Checkout encerrado");
    }
    expect(billingCheckoutPresentation("approved", false).title).toBe("Pagamento confirmado");
  });
  it("distinguishes an open payment from one being reviewed", () => {
    expect(billingCheckoutPresentation("pending", true).title).toBe("Aguardando pagamento");
    expect(billingCheckoutPresentation("in_process", false).title).toBe("Pagamento em análise");
    expect(billingCheckoutPresentation("rejected", true).description).toContain("Pix");
  });
});
