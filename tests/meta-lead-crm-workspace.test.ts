import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { historyDatabase } from "./helpers/history-database";
import * as names from "@/lib/whatsapp/lead-names";
import * as technical from "@/lib/client-os/lead-technical-profile";
import type { ClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";

const crm = serverModuleHarness<{
  getLeadCrmWorkspaceForCompanies(input: Record<string, unknown>): Promise<ClientLeadCrmWorkspace>;
  getAdminLeadCrmWorkspace(input: Record<string, unknown>): Promise<ClientLeadCrmWorkspace>;
}>("src/lib/client-os/leads-crm.ts", {
  "./lead-technical-profile": technical,
  "@/lib/whatsapp/lead-names": names,
  "@/lib/whatsapp/lead-avatar-sync": { readLeadProfileImageUrl: () => null },
  "@/lib/whatsapp/conversation-panel-scope": { platformWhatsappOrganizationSlug: "connectyhub-platform-whatsapp" },
}, ["getLeadCrmWorkspaceForCompanies"]);
const company = (n: number) => ({ id: `org-${n}`, name: `Empresa ${n}`, planCode: "internal", status: "active" });
const lead = (n: number) => ({
  id: `lead-${n}`, organization_id: `org-${n}`, channel: "meta_lead_ads", source: "meta_lead_ads",
  display_name: `Teste CRM ConnectyHub ${n}`, status: "new", metadata: { email: `test${n}@example.com`, outreach_authorized: false },
  created_at: new Date(2026, 0, 1, 0, n).toISOString(), updated_at: new Date(2026, 0, 1, 0, n).toISOString(),
});

describe("Meta instant forms in CRM", () => {
  it("shows form leads without conversations, respecting tenant and channel boundaries", async () => {
    const db = historyDatabase({ leads: [lead(1), lead(2), { ...lead(1), id: "api-lead", channel: "whatsapp", source: "api" }] });
    const result = await crm.getLeadCrmWorkspaceForCompanies({ client: db.client, companies: [company(1)], syncAvatars: false });
    expect(result.warnings).toBeUndefined();
    expect(result.leads.map(item => item.id)).toEqual(["lead-1"]);
    expect(result.leads[0].email).toBe("test1@example.com");
    expect(result.leads[0].name).toBe("Teste CRM ConnectyHub 1");
    expect(result.leads[0].conversation.id).toBeNull();
    expect(db.calls).not.toContain("conversation_messages");
  });

  it("bounds admin tenant filters and applies sorting and limit across every batch", async () => {
    const companies = Array.from({ length: 500 }, (_, n) => company(n));
    const db = historyDatabase({ leads: Array.from({ length: 501 }, (_, n) => lead(n)) });
    const result = await crm.getLeadCrmWorkspaceForCompanies({ client: db.client, companies, leadLimit: 3, syncAvatars: false });
    expect(result.warnings).toBeUndefined();
    expect(result.leads.map(item => item.id)).toEqual(["lead-499", "lead-498", "lead-497"]);
    expect(result.companies).toHaveLength(500);
    expect(db.inFilters.filter(filter => filter.column === "organization_id").every(filter => filter.size <= 50)).toBe(true);
  });

  it("reports form retrieval failure instead of silently claiming an empty CRM", async () => {
    const db = historyDatabase({}, "leads");
    const result = await crm.getLeadCrmWorkspaceForCompanies({ client: db.client, companies: [company(1)], syncAvatars: false });
    expect(result.warnings?.[0]).toContain("formularios Meta");
  });

  it("includes the platform's operation even beyond the 500 most recent companies", async () => {
    const organizations = Array.from({ length: 501 }, (_, n) => ({
      ...company(n), slug: n === 0 ? "connectyhub-platform-whatsapp" : `customer-${n}`,
      plan_code: n === 0 ? "internal" : "scale", created_at: new Date(2026, 0, 1, 0, n).toISOString(),
    }));
    const db = historyDatabase({ organizations, leads: [lead(0)] });
    const result = await crm.getAdminLeadCrmWorkspace({ client: db.client, syncAvatars: false });
    expect(result.warnings).toBeUndefined();
    expect(result.companies).toHaveLength(501);
    expect(result.leads.map(item => item.id)).toEqual(["lead-0"]);
  });
});
