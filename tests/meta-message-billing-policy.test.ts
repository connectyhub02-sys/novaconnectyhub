import { describe, expect, it } from "vitest";
import {
  MetaMessageBillingError,
  campaignCostEstimate,
  expectedMessageCategory,
  formatBrl,
  metaBillingMode,
  metaMessageBillingCode,
  statusPricing,
  metaPaymentStatusFromHealth,
  metaPaymentUrl,
} from "@/lib/meta/message-billing-policy";

describe("official WhatsApp message billing policy", () => {
  it("expects the template category, and service for free-form replies", () => {
    expect(expectedMessageCategory("template", "MARKETING")).toBe("marketing");
    expect(expectedMessageCategory("template", "UTILITY")).toBe("utility");
    expect(expectedMessageCategory("template", "AUTHENTICATION")).toBe("authentication");
    expect(expectedMessageCategory("template", undefined)).toBe("marketing");
    expect(expectedMessageCategory("text")).toBe("service");
    expect(expectedMessageCategory("image", "MARKETING")).toBe("service");
  });

  it("normalizes Meta's status pricing object", () => {
    expect(statusPricing({ billable: true, pricing_model: "PMP", type: "regular", category: "marketing" })).toEqual({ billable: true, type: "regular", category: "marketing", pricing_model: "PMP" });
    expect(statusPricing({ billable: false, type: "free_customer_service", category: "service", subtype: "free_tier" })?.type).toBe("free_customer_service");
    expect(statusPricing(undefined)).toBeNull();
    expect(statusPricing({})).toBeNull();
    expect(statusPricing([])).toBeNull();
  });

  it("defaults every sender to the customer paying Meta", () => {
    expect(metaBillingMode(undefined)).toBe("customer_meta");
    expect(metaBillingMode("anything")).toBe("customer_meta");
    expect(metaBillingMode("connectyhub_credit_line")).toBe("connectyhub_credit_line");
  });

  it("maps database refusals to customer messages without sending", () => {
    expect(metaMessageBillingCode("META_MESSAGE_BALANCE_INSUFFICIENT")).toBe("balance_insufficient");
    expect(metaMessageBillingCode("ERROR: META_MESSAGE_DEBT")).toBe("debt");
    expect(metaMessageBillingCode("META_MESSAGE_RATE_MISSING")).toBe("rate_missing");
    expect(metaMessageBillingCode("connection reset")).toBe("unavailable");
    expect(new MetaMessageBillingError("balance_insufficient").message).toMatch(/Saldo do WhatsApp oficial insuficiente/);
  });

  it("estimates campaigns at twice the Meta marketing rate", () => {
    expect(campaignCostEstimate(1000, 0.6434)).toBe(643.4);
    expect(campaignCostEstimate(3, 0.07)).toBe(0.21);
    expect(campaignCostEstimate(10, null)).toBeNull();
    expect(campaignCostEstimate(-5, 0.07)).toBe(0);
  });

  it("formats reais with optional four decimals", () => {
    expect(formatBrl(0.6434, true)).toMatch(/0,6434/);
    expect(formatBrl(643.4)).toMatch(/643,40/);
  });

  it("detects a missing Meta payment method from the sender health status", () => {
    const health = { can_send_message: "BLOCKED", entities: [
      { entity_type: "PHONE_NUMBER", id: "1373711385827414", can_send_message: "AVAILABLE", errors: [{ error_code: 138024 }] },
      { entity_type: "WABA", id: "1077354978498958", can_send_message: "BLOCKED", errors: [{ error_code: 141006, error_description: "There is an error with the payment method." }] },
      { entity_type: "BUSINESS", id: "293619797157346", can_send_message: "LIMITED", errors: [{ error_code: 141010 }] },
    ] };
    const status = metaPaymentStatusFromHealth("1077354978498958", health);
    expect(status.status).toBe("missing");
    expect(status.businessId).toBe("293619797157346");
    expect(status.paymentUrl).toBe("https://business.facebook.com/billing_hub/accounts/details/?business_id=293619797157346&asset_id=1077354978498958&placement=standalone");
    expect(status.issues).toHaveLength(2);
  });

  it("treats a healthy or unreadable sender without blocking", () => {
    expect(metaPaymentStatusFromHealth("1", { can_send_message: "AVAILABLE", entities: [{ entity_type: "WABA", id: "1", can_send_message: "AVAILABLE" }] }).status).toBe("ok");
    expect(metaPaymentStatusFromHealth("1", undefined).status).toBe("unknown");
    expect(metaPaymentUrl("123456", null)).toBe("https://business.facebook.com/billing_hub/accounts/details/?asset_id=123456&placement=standalone");
  });
});
