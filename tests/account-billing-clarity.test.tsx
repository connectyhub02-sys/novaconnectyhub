import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { accountCreditBalance } from "../src/lib/billing/account-credit-summary";
import { TopupSummary, type CreditsData } from "../src/components/connectyhub-os/credits-console";

describe("current balance and persisted topup authorization", () => {
  it("uses spendable balance, independent of a closed cycle's 15% usage", () => {
    const balance = accountCreditBalance(2919.49404, 233.6544, 170938.19672);
    expect(balance.available).toBeCloseTo(2685.83964, 5);
    expect(balance.remainingPercent).toBeCloseTo(1.571, 2);
    expect(balance.low).toBe(true);
  });
  it("does not invent a percentage without a reference or a negative available balance", () => {
    expect(accountCreditBalance(5, 10, 0)).toEqual({ available: 0, reference: 0, remainingPercent: null, low: false });
    expect(accountCreditBalance(2000, 0, 1000).remainingPercent).toBe(100);
  });
  const data = {
    cards: [{ id: "new", brand: "mastercard", last_digits: "7842", created_at: "2026-10-26T18:28:00Z" }],
    policy: { enabled: true, card_method_id: "new", product_id: "pack", threshold_credits: 100, agreed_amount_brl: 47, agreed_credits: 5000, monthly_cap_brl: 47, authorized_at: "2026-10-26T18:33:00Z" },
  } as CreditsData;
  it("identifies the authorized card and agreed terms even if its product leaves the catalog", () => {
    const html = renderToStaticMarkup(<TopupSummary data={data} />);
    expect(html).toContain("MASTERCARD •••• 7842");
    expect(html).toContain("5.000");
    expect(html).toContain("100");
    expect(html).toContain("47,00");
    expect(html).toContain("Permanece ativa");
  });
  it("does not substitute another default card for a missing authorized card", () => {
    const html = renderToStaticMarkup(<TopupSummary data={{ ...data, policy: { ...data.policy!, card_method_id: "missing" } }} />);
    expect(html).toContain("Cartão da autorização indisponível");
    expect(html).not.toContain("7842");
  });
  it("distinguishes a saved card from authorization to buy credits", () => {
    expect(renderToStaticMarkup(<TopupSummary data={{ ...data, policy: null }} />)).toContain("Salvar um cartão não ativa a recarga");
  });
});
