import { describe, expect, it } from "vitest";
import { findMetaWebhookIntegration } from "../src/lib/meta/webhook-routing";

const row = (organization: string, metadata: Record<string, unknown> | null) => ({ id: organization, organization_id: organization, metadata });
describe("Meta webhook workspace ownership", () => {
  it("does not route discovered Pages or Instagram accounts", () => {
    expect(findMetaWebhookIntegration([row("foreign", { facebook_pages: [{ id: "page" }], instagram_accounts: [{ id: "ig", parentId: "page" }] })], "page")).toBeNull();
  });
  it("routes to the selected owner even when another workspace discovered it first", () => {
    const owner = row("owner", { selected_facebook_page_id: "page" });
    expect(findMetaWebhookIntegration([row("foreign", { facebook_pages: [{ id: "page" }] }), owner], "page")).toBe(owner);
  });
  it("rejects ambiguous ownership in either row order", () => {
    const rows = [row("one", { selected_facebook_page_id: "page" }), row("two", { facebook_page_id: "page" })];
    expect(findMetaWebhookIntegration(rows, "page")).toBeNull();
    expect(findMetaWebhookIntegration(rows.reverse(), "page")).toBeNull();
  });
  it.each([null, "", "other"])("respects explicit selection %s over legacy metadata", (value) => {
    expect(findMetaWebhookIntegration([row("owner", { selected_facebook_page_id: value, facebook_page_id: "page" })], "page")).toBeNull();
  });
  it("supports legacy selections without a selected key", () => {
    const owner = row("owner", { instagram_business_id: "ig" });
    expect(findMetaWebhookIntegration([owner], "ig")).toBe(owner);
  });
  it("does not infer a Page from the parent of a discovered Instagram account", () => {
    expect(findMetaWebhookIntegration([row("owner", { selected_instagram_business_id: "ig", instagram_accounts: [{id:"ig", parentId:"page"}] })], "page")).toBeNull();
  });
});
