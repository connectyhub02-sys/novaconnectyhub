import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const atendimentoPageSource = readFileSync("src/app/admin/whatsapp/atendimento/page.tsx", "utf8");
const adminLeadsPageSource = readFileSync("src/app/admin/leads/page.tsx", "utf8");
const adminWhatsappConsoleSource = readFileSync("src/components/connectyhub-os/admin-whatsapp-atendimento-console.tsx", "utf8");
const leadConsoleSource = readFileSync("src/components/connectyhub-os/leads-crm-console.tsx", "utf8");
const leadsCrmSource = readFileSync("src/lib/client-os/leads-crm.ts", "utf8");
const panelScopeSource = readFileSync("src/lib/whatsapp/conversation-panel-scope.ts", "utf8");
const replyRouteSource = readFileSync("src/app/api/dashboard/conversations/reply/route.ts", "utf8");
const handoffRouteSource = readFileSync("src/app/api/dashboard/conversations/handoff/route.ts", "utf8");

describe("Admin internal WhatsApp workspace scope", () => {
  it("loads only the platform internal WhatsApp organization in the internal attendance screen", () => {
    expect(atendimentoPageSource).toContain('scope: "platform_internal"');
    expect(panelScopeSource).toContain('platformWhatsappOrganizationSlug = "connectyhub-platform-whatsapp"');
    expect(leadsCrmSource).toContain('scope === "platform_internal"');
    expect(leadsCrmSource).toContain('.eq("slug", platformWhatsappOrganizationSlug)');
  });

  it("protects internal manual actions from conversations outside the internal organization", () => {
    expect(adminWhatsappConsoleSource).toContain('conversationPanelScope="platform_internal"');
    expect(leadConsoleSource).toContain("panelScope: conversationPanelScope");
    expect(replyRouteSource).toContain("parseConversationPanelScope(body?.panelScope)");
    expect(replyRouteSource).toContain("ensureConversationPanelScope");
    expect(handoffRouteSource).toContain("parseConversationPanelScope(body?.panelScope)");
    expect(handoffRouteSource).toContain("ensureConversationPanelScope");
    expect(panelScopeSource).toContain("Esta conversa nao pertence ao WhatsApp Interno da ConnectyHub.");
  });

  it("keeps the general admin leads CRM unrestricted", () => {
    expect(adminLeadsPageSource).toContain("getAdminLeadCrmWorkspace()");
    expect(adminLeadsPageSource).not.toContain('scope: "platform_internal"');
  });
});
