import { describe, expect, it } from "vitest";
import * as references from "../src/lib/billing/payment-reference";
import * as messages from "../src/lib/billing/platform-billing-messages";
import { serverModuleHarness } from "./helpers/server-module-harness";

const ids = { organizationId: "3f473c21-55aa-425a-a818-a5fa6d826748", subscriptionId: "56351d8e-5e74-475e-8b59-e5dd57aea150", invoiceId: "b025a8a3-9d2f-479c-a3e0-c648dd2a4877", paymentId: "a07c3e81-5434-4520-a531-cf38e3cfc8bf" };
const legacy = "connectyhub_subscription:" + Object.values(ids).join(":");

describe("Asaas billing references", () => {
  it("preserves every identifier within the provider limit", () => {
    const compact = references.compactPlatformBillingReference(legacy);
    expect(compact).toHaveLength(92);
    expect(references.expandPlatformBillingReference(compact)).toBe(legacy);
    expect(references.compactPlatformBillingReference(compact)).toBe(compact);
    expect(references.expandPlatformBillingReference(legacy)).toBe(legacy);
    expect(references.compactPlatformBillingReference("billing_managed:" + ids.paymentId)).toBe("billing_managed:" + ids.paymentId);
  });
  it("routes both existing and compact webhook references to the same customer, invoice and payment", () => {
    const webhook = serverModuleHarness<{ parsePlatformBillingExternalReference: (value: string) => typeof ids | null }>("src/lib/billing/platform-billing-webhook.ts", { "./payment-reference": references, "@/lib/billing/platform-billing-messages": messages }, ["parsePlatformBillingExternalReference"]);
    expect(webhook.parsePlatformBillingExternalReference(legacy)).toEqual(ids);
    expect(webhook.parsePlatformBillingExternalReference(references.compactPlatformBillingReference(legacy))).toEqual(ids);
    expect(webhook.parsePlatformBillingExternalReference("chsub:invalid")).toBeNull();
    expect(webhook.parsePlatformBillingExternalReference(references.compactPlatformBillingReference(legacy) + "x")).toBeNull();
  });
});
