import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const atendimentoPageSource = readFileSync("src/app/admin/whatsapp/atendimento/page.tsx", "utf8");
const adminLeadsPageSource = readFileSync("src/app/admin/leads/page.tsx", "utf8");
const leadsCrmSource = readFileSync("src/lib/client-os/leads-crm.ts", "utf8");

describe("Admin internal WhatsApp workspace scope", () => {
  it("loads only the platform internal WhatsApp organization in the internal attendance screen", () => {
    expect(atendimentoPageSource).toContain('scope: "platform_internal"');
    expect(leadsCrmSource).toContain('const platformWhatsappOrganizationSlug = "connectyhub-platform-whatsapp"');
    expect(leadsCrmSource).toContain('scope === "platform_internal"');
    expect(leadsCrmSource).toContain('.eq("slug", platformWhatsappOrganizationSlug)');
  });

  it("keeps the general admin leads CRM unrestricted", () => {
    expect(adminLeadsPageSource).toContain("getAdminLeadCrmWorkspace()");
    expect(adminLeadsPageSource).not.toContain('scope: "platform_internal"');
  });
});
