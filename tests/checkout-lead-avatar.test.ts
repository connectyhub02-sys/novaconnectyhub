import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";

vi.mock("server-only", () => ({}));

import { loadCheckoutLeadAvatar } from "@/lib/sales-catalog/checkout-lead-avatar";

describe("Checkout customer photo", () => {
  const input = { organizationId: "store", leadId: "buyer", conversationId: "conversation" };
  const photo = "https://example.com/buyer.jpg";

  it("reuses the CRM photo without writing customer or payment data", async () => {
    const db = commerceDatabase({ leads: [{ id: "buyer", organization_id: "store", metadata: { profile_image_url: photo } }] });
    const before = JSON.stringify(db.tables);
    expect(await loadCheckoutLeadAvatar(db.client as never, input)).toBe(photo);
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it("does not expose a different store's lead photo", async () => {
    const db = commerceDatabase({ leads: [{ id: "buyer", organization_id: "other-store", metadata: { profile_image_url: photo } }] });
    expect(await loadCheckoutLeadAvatar(db.client as never, input)).toBeNull();
    expect(await loadCheckoutLeadAvatar(db.client as never, { ...input, leadId: null })).toBeNull();
  });

  it("only uses a conversation photo belonging to the same store and lead", async () => {
    const db = commerceDatabase({
      leads: [{ id: "buyer", organization_id: "store", metadata: {} }],
      conversations: [{ id: "conversation", lead_id: "other-buyer", organization_id: "store", metadata: { profile_image_url: photo } }],
    });
    expect(await loadCheckoutLeadAvatar(db.client as never, input)).toBeNull();
    db.tables.conversations[0].lead_id = "buyer";
    expect(await loadCheckoutLeadAvatar(db.client as never, input)).toBe(photo);
    db.tables.conversations[0].organization_id = "other-store";
    expect(await loadCheckoutLeadAvatar(db.client as never, input)).toBeNull();
  });

  it("does not interrupt checkout when the photo cannot be loaded", async () => {
    const client = { from: () => { throw new Error("CRM unavailable"); } };
    expect(await loadCheckoutLeadAvatar(client as never, input)).toBeNull();
  });
});
