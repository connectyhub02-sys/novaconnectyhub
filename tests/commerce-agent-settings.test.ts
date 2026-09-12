import { describe, expect, it } from "vitest";
import * as agentSettings from "@/lib/commerce-agent/agent-settings";
import * as behavior from "@/lib/whatsapp/agent-behavior";
import * as templates from "@/lib/whatsapp/agent-prompt-templates";
import * as activity from "@/lib/whatsapp/activity-profile";
import { createDefaultSalesCatalogCommerceAgentSettings } from "@/lib/sales-catalog/shared";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import type * as Server from "@/lib/commerce-agent/server";

const org = "10000000-0000-4000-8000-000000000001";
const agentId = "20000000-0000-4000-8000-000000000002";
const globalId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const leadId = "40000000-0000-4000-8000-000000000001";
const legacy = createDefaultSalesCatalogCommerceAgentSettings();
function attendant(templateId = "corretor_imoveis", preferences = {}) {
  return { id: agentId, organization_id: org, agent_code: "renata", status: "needs_review", name: "Renata Macedo", persona_name: "Renata Macedo", created_at: "2026-09-02", metadata: { [templates.promptBuilderMetadataKey]: { templateId }, whatsapp_behavior_config: { agentEnabled: true, ...preferences } } };
}
const globalAgent = { ...attendant(), id: globalId, agent_code: "agente-whatsapp-global", name: "Agente Global WhatsApp", persona_name: "Rafael Nunes", created_at: "2026-09-01", metadata: { controls_all_whatsapp_agents: true } };
function harness(rows = [globalAgent, attendant()], config = legacy, defaultAgentId: string | null = null) {
  const db = commerceDatabase({ organizations: [{ id: org, name: "Imobiliária Exemplo", metadata: {} }], agent_registry: rows, leads: [{ id: leadId, organization_id: org, display_name: null, metadata: {} }], commerce_sessions: [{ id: sessionId, organization_id: org, lead_id: leadId, lead_name: "Renata Macedo", metadata: { agent_id: globalId, lead_name: "Renata Macedo" } }] });
  const api = serverModuleHarness<typeof Server & { loadRecentMessages: (...args: unknown[]) => Promise<{ id: string }[]>; loadCommerceAgent: (...args: unknown[]) => Promise<ReturnType<typeof attendant> | null>; buildQuickActions: (...args: unknown[]) => { label: string; message: string }[]; emptyPromptContext: () => Record<string, unknown>; buildProductWhisperMessage: (...args: unknown[]) => string; buildContextualAssistantOpener: (...args: unknown[]) => string }>("src/lib/commerce-agent/server.ts", {
    "./agent-settings": agentSettings,
    "@/lib/whatsapp/agent-behavior": behavior,
    "@/lib/whatsapp/agent-prompt-templates": templates,
    "@/lib/whatsapp/activity-profile": activity,
    "@/lib/supabase/service": { createServiceClient: () => db.client },
    "@/lib/sales-catalog/public-commerce-access": { isPublicCommerceAvailable: async () => true },
    "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => ({ commerceAgent: { ...config }, automationSettings: { defaultAgentId } }) },
    "@/lib/tracking/organization-attribution": { verifyOrganizationTrackingToken: () => true },
    "@/lib/tracking/lead-context": { resolveLeadTrackingContext: async () => ({ leadId, conversationId: null, leadPhone: null }) },
    "@/lib/whatsapp/instance-profile-image": { readWhatsappInstanceProfileImageUrl: () => null },
  }, ["loadRecentMessages", "loadCommerceAgent", "buildQuickActions", "emptyPromptContext", "buildProductWhisperMessage", "buildContextualAssistantOpener"]);
  return { api, db };
}

describe("agent-owned storefront", () => {
  it.each(["corretor_imoveis", "imobiliaria", "advogado", "escritorio_advocacia", "dentista", "clinica_odontologica", "pizzaria_delivery"])("inherits activity and activation for %s", templateId => {
    const settings = agentSettings.resolveAgentStoreSettings(attendant(templateId, { storefrontEnabled: true, storefrontMode: "observer" }), { ...legacy, enabled: false, verticalPlaybook: "fashion" });
    expect(settings).toMatchObject({ enabled: true, mode: "observer", surfaces: ["store", "product", "cart", "checkout"] });
    expect(settings.verticalPlaybook).toBe(["corretor_imoveis", "imobiliaria"].includes(templateId) ? "real_estate" : templateId === "pizzaria_delivery" ? "food" : "services");
  });
  it("preserves legacy choice, explicit off, and paused preferences", () => {
    expect(agentSettings.resolveAgentStoreSettings(attendant(), legacy).enabled).toBe(true);
    expect(agentSettings.resolveAgentStoreSettings(attendant(), { ...legacy, enabled: false }).enabled).toBe(false);
    expect(agentSettings.resolveAgentStoreSettings(attendant("dentista", { storefrontEnabled: false }), legacy).enabled).toBe(false);
    const saved = behavior.normalizeWhatsappBehaviorSettings({ agentEnabled: false, storefrontEnabled: true, storefrontMode: "active_seller" });
    expect(saved.storefrontEnabled).toBe(true);
    expect(behavior.normalizeWhatsappBehaviorConfig(saved).storefrontEnabled).toBe(false);
    expect(agentSettings.resolveAgentStoreSettings(attendant("dentista", saved), legacy).enabled).toBe(false);
    expect(agentSettings.resolveAgentStoreSettings(attendant("dentista", { ...saved, agentEnabled: true }), legacy).enabled).toBe(true);
    expect(behavior.normalizeWhatsappBehaviorSettings({}).storefrontEnabled).toBeUndefined();
    expect(behavior.normalizeWhatsappBehaviorSettings({ storefrontMode: "invalid" }).storefrontMode).toBeUndefined();
  });
  it("excludes internal controllers even if explicitly selected", async () => {
    const { api, db } = harness();
    expect(await api.loadCommerceAgent(db.client, org, globalId)).toBeNull();
    expect((await api.loadCommerceAgent(db.client, org, null))?.id).toBe(agentId);
    expect(agentSettings.resolveAgentStoreSettings(globalAgent, legacy).enabled).toBe(false);
  });
  it("does not borrow an agent from another company or select archived/paused agents", async () => {
    const { api, db } = harness([{ ...attendant(), organization_id: "other" }, { ...attendant(), status: "archived" }, attendant("dentista", { agentEnabled: false })]);
    expect(await api.loadCommerceAgent(db.client, org, null)).toBeNull();
  });
  it("prefers an explicitly enabled agent over a legacy fallback", async () => {
    const { api, db } = harness([attendant(), { ...attendant("dentista", { storefrontEnabled: true }), id: globalId, created_at: "2026-09-03" }]);
    expect((await api.loadCommerceAgent(db.client, org, null))?.id).toBe(globalId);
  });
  it.each(["store", "product"])("recovers stale global identity and unconfirmed visitor on %s", async surface => {
    const { api, db } = harness();
    const result = await api.resolveCommerceAgentContext({ organization_id: org, surface, commerce_session_id: sessionId });
    expect(result).toMatchObject({ ok: true, agentId, agentName: "Renata Macedo", leadName: null, settings: { commerceAgent: { verticalPlaybook: "real_estate" } } });
    expect(db.tables.commerce_sessions[0]).toMatchObject({ lead_name: null, metadata: { agent_id: agentId, lead_name: null } });
  });
  it("explicit off blocks a selected agent instead of silently switching", async () => {
    const { api } = harness([globalAgent, attendant("dentista", { storefrontEnabled: false })]);
    expect(await api.resolveCommerceAgentContext({ organization_id: org, surface: "product", agent_id: agentId })).toMatchObject({ ok: false, status: 200 });
  });
  it("uses the product's assigned agent on a direct link before the company default", async () => {
    const productId = "50000000-0000-4000-8000-000000000001";
    const other = { ...attendant("dentista"), id: globalId, persona_name: "Dentista Exemplo" };
    const { api, db } = harness([attendant(), other], legacy, agentId);
    db.tables.intelligence_memory = [{ id: productId, organization_id: org, scope: "organization", memory_type: "sales_catalog_item", metadata: { assigned_agent_ids: [globalId] } }];
    expect(await api.resolveCommerceAgentContext({ organization_id: org, surface: "product", product_id: productId })).toMatchObject({ ok: true, agentId: globalId, agentName: "Dentista Exemplo" });
    expect(await api.resolveCommerceAgentContext({ organization_id: org, surface: "product", product_id: productId, agent_id: agentId })).toMatchObject({ ok: true, agentId });
  });
  it("works when old store configuration was disabled but agent is now enabled", async () => {
    const { api } = harness([attendant("dentista", { storefrontEnabled: true })], { ...legacy, enabled: false });
    expect(await api.resolveCommerceAgentContext({ organization_id: org, surface: "store" })).toMatchObject({ ok: true });
  });
  it("rejects unsupported pages", async () => {
    const { api } = harness();
    expect(await api.resolveCommerceAgentContext({ organization_id: org, surface: "unknown" })).toMatchObject({ ok: false });
  });
  it("keeps the visitor history without replaying another attendant's messages", async () => {
    const { api, db } = harness();
    db.tables.commerce_agent_messages = [
      { id: "old", role: "assistant", organization_id: org, commerce_session_id: sessionId, metadata: { agent_id: globalId }, created_at: "2026-09-11" },
      { id: "visitor", role: "lead", organization_id: org, commerce_session_id: sessionId, metadata: { agent_id: globalId }, created_at: "2026-09-11" },
      { id: "current", role: "assistant", organization_id: org, commerce_session_id: sessionId, metadata: { agent_id: agentId }, created_at: "2026-09-11" },
    ];
    const messages = await api.loadRecentMessages({ client: db.client, organization: { id: org }, commerceSessionId: sessionId, agentId });
    expect(messages.map(message => message.id)).toEqual(["visitor", "current"]);
    expect(db.tables.commerce_agent_messages).toHaveLength(3);
  });
  it("uses confirmed namesakes but does not use the attendant name as visitor identity", () => {
    const lead = { display_name: "Renata Macedo", metadata: {} };
    expect(agentSettings.resolveStoreLeadName(lead, "Renata Macedo")).toBeNull();
    expect(agentSettings.resolveStoreLeadName({ ...lead, metadata: { lead_name_evidence: { source: "lead_message", name: "Renata Macedo" } } }, "Renata Macedo")).toBe("Renata Macedo");
    expect(agentSettings.resolveStoreLeadName({ display_name: "Magno Gomes", metadata: {} }, "Renata Macedo")).toBe("Magno Gomes");
  });
  it("chooses appointment or sale actions per item, even in a mixed dentist catalog", () => {
    const { api } = harness();
    const context = { surface: "product", agentMetadata: attendant("dentista").metadata, settings: { commerceAgent: legacy }, leadName: null };
    const prompt = { ...api.emptyPromptContext(), agendaEnabled: true, currentProduct: { id: "item", title: "Avaliação", salesDestination: "appointment" } };
    expect(api.buildQuickActions(context, prompt).map(x => x.label)).toEqual(["Tirar dúvidas", "Como agendar"]);
    expect(api.buildProductWhisperMessage(context, prompt, "")).toContain("agendar");
    const paused = { ...prompt, agendaEnabled: false };
    expect(api.buildQuickActions(context, paused).map(x => x.label)).toEqual(["Tirar dúvidas"]);
    expect(api.buildProductWhisperMessage(context, paused, "")).not.toMatch(/agendar|agendamento/);
    expect(api.buildContextualAssistantOpener(context, paused)).not.toMatch(/agendar|agendamento|compra|carrinho/);
    expect(api.buildContextualAssistantOpener(context, prompt)).not.toMatch(/pedido|carrinho|compra/);
    expect(api.buildQuickActions(context, { ...prompt, currentProduct: { salesDestination: "connectyhub_checkout" } }).map(x => x.label)).toContain("Revisar pedido");
    expect(api.buildQuickActions(context, { ...prompt, currentProduct: { salesDestination: "external_site" } }).map(x => x.label)).toEqual(["Tirar dúvidas"]);
    expect(api.buildQuickActions({ ...context, settings: { commerceAgent: { ...legacy, mode: "observer" } } }, prompt)).toEqual([]);
  });
  it.each(["corretor_imoveis", "dentista", "advogado"])("uses visited items in the appointment approach for %s", templateId => {
    const { api } = harness();
    const context = { surface: "product", agentMetadata: attendant(templateId).metadata, settings: { commerceAgent: legacy }, leadName: null };
    const prompt = { ...api.emptyPromptContext(), currentProduct: { id: "current", title: "Opção atual", salesDestination: "appointment" }, recentProductViews: [{ id: "previous", title: "Opção anterior" }] };
    for (const text of [api.buildProductWhisperMessage(context, prompt, ""), api.buildContextualAssistantOpener(context, prompt)]) {
      expect(text).toContain("Opção atual");
      expect(text).toContain("Opção anterior");
      expect(text).toContain("comparar");
      expect(text).not.toMatch(/pedido|carrinho|compra|pagamento/);
    }
  });
});
