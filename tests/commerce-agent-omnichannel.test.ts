import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type * as Server from "@/lib/commerce-agent/server";
import type * as Tracking from "@/lib/tracking/lead-context";
import * as agentSettings from "@/lib/commerce-agent/agent-settings";
import * as behavior from "@/lib/whatsapp/agent-behavior";
import * as templates from "@/lib/whatsapp/agent-prompt-templates";
import * as activity from "@/lib/whatsapp/activity-profile";
import { createDefaultSalesCatalogCommerceAgentSettings } from "@/lib/sales-catalog/shared";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const org = "10000000-0000-4000-8000-000000000001";
const agentId = "20000000-0000-4000-8000-000000000001";
const otherAgent = "20000000-0000-4000-8000-000000000002";
const leadId = "30000000-0000-4000-8000-000000000001";
const otherLead = "30000000-0000-4000-8000-000000000002";
const conversationId = "40000000-0000-4000-8000-000000000001";
const instanceId = "50000000-0000-4000-8000-000000000001";
const sessionId = "60000000-0000-4000-8000-000000000001";
type Context = Extract<Server.CommerceAgentResolvedContext, { ok: true }>;
type Api = typeof Server & {
  ensureCommerceSession(context: Context): Promise<string>;
  loadRecentMessages(context: Context): Promise<Array<{ id: string; content: string }>>;
  loadWhatsappConversationMessages(context: Context): Promise<Array<{ text_content: string }>>;
};

function setup(templateId = "corretor_imoveis", failure?: { table: string; operation: string }) {
  const agent = { id: agentId, organization_id: org, name: "Agente de teste", persona_name: "Agente de teste", status: "active", metadata: { [templates.promptBuilderMetadataKey]: { templateId }, whatsapp_behavior_config: { agentEnabled: true, storefrontEnabled: true } } };
  const db = commerceDatabase({
    organizations: [{ id: org, name: "Negócio de teste", metadata: {} }],
    agent_registry: [agent, { ...agent, id: otherAgent, name: "Outro", persona_name: "Outro" }],
    leads: [{ id: leadId, organization_id: org, display_name: "Visitante", phone_number: null, metadata: {} }, { id: otherLead, organization_id: org, display_name: "Outra pessoa", phone_number: "5599999999999", metadata: {} }],
    conversations: [{ id: conversationId, organization_id: org, lead_id: leadId, channel: "whatsapp", whatsapp_instance_id: instanceId, last_message_at: "2026-09-11" }],
    whatsapp_instances: [{ id: instanceId, organization_id: org, status: "connected", phone_number: "5500000000000", metadata: { agent_id: agentId } }],
    commerce_sessions: [{ id: sessionId, organization_id: org, lead_id: leadId, conversation_id: conversationId, visitor_cookie_id: "same-browser", session_cookie_id: "same-session-cookie", metadata: { agent_id: agentId }, status: "active" }],
    conversation_messages: [{ id: "whatsapp-1", organization_id: org, conversation_id: conversationId, direction: "inbound", text_content: "Quero comparar as opções com jardim", occurred_at: "2026-09-11" }],
  }, failure);
  const tracking = serverModuleHarness<typeof Tracking>("src/lib/tracking/lead-context.ts");
  const api = serverModuleHarness<Api>("src/lib/commerce-agent/server.ts", {
    "./agent-settings": agentSettings,
    "@/lib/whatsapp/agent-behavior": behavior,
    "@/lib/whatsapp/agent-prompt-templates": templates,
    "@/lib/whatsapp/activity-profile": activity,
    "@/lib/supabase/service": { createServiceClient: () => db.client },
    "@/lib/sales-catalog/public-commerce-access": { isPublicCommerceAvailable: async () => true },
    "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => ({ commerceAgent: createDefaultSalesCatalogCommerceAgentSettings(), automationSettings: { defaultAgentId: otherAgent } }) },
    "@/lib/tracking/organization-attribution": { verifyOrganizationTrackingToken: () => true },
    "@/lib/tracking/lead-context": tracking,
    "@/lib/whatsapp/instance-profile-image": { readWhatsappInstanceProfileImageUrl: () => null },
  }, ["ensureCommerceSession", "loadRecentMessages", "loadWhatsappConversationMessages"]);
  return { db, api };
}

async function resolve(api: Api, body: Parameters<Api["resolveCommerceAgentContext"]>[0] = {}) {
  const result = await api.resolveCommerceAgentContext({ organization_id: org, surface: "product", lead_id: leadId, commerce_session_id: sessionId, visitor_cookie_id: "same-browser", session_cookie_id: "same-session-cookie", ...body });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("shared agent continuity", () => {
  it.each(["corretor_imoveis", "imobiliaria", "advogado", "escritorio_advocacia", "dentista", "clinica_odontologica", "pizzaria_delivery"])("keeps WhatsApp attendant and conversation across pages for %s", async templateId => {
    const { api } = setup(templateId);
    const context = await resolve(api, { conversation_id: conversationId, agent_id: otherAgent });
    expect(context).toMatchObject({ agentId, leadId, conversationId });
    expect((await api.loadWhatsappConversationMessages(context))[0].text_content).toContain("jardim");
    const saved = await api.persistCommerceAgentMessage({ context, role: "lead", content: "Gostei da opção com varanda." });
    const next = await resolve(api, { lead_id: undefined, surface: "store" });
    expect(next).toMatchObject({ agentId, leadId, conversationId });
    expect(await api.loadRecentMessages(next)).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.id, content: "Gostei da opção com varanda." })]));
  });

  it("recovers the chosen attendant's WhatsApp conversation from the known lead", async () => {
    const { api, db } = setup();
    db.tables.commerce_sessions = [];
    const context = await resolve(api, { commerce_session_id: undefined, agent_id: agentId });
    expect(context).toMatchObject({ agentId, leadId, conversationId });
    const other = await resolve(api, { commerce_session_id: undefined, agent_id: otherAgent });
    expect(other.conversationId).toBeNull();
    expect(other.agentId).toBe(otherAgent);
  });

  it("does not let a previous session override an explicitly chosen attendant", async () => {
    const { api, db } = setup();
    const context = await resolve(api, { agent_id: otherAgent });
    expect(context).toMatchObject({ agentId: otherAgent, leadId, conversationId: null });
    expect(db.tables.commerce_sessions[0].conversation_id).toBeNull();
    expect(await api.loadWhatsappConversationMessages(context)).toEqual([]);
  });

  it("keeps a new unidentified conversation separate from an identified browser session", async () => {
    const { api, db } = setup();
    const newConversation = "40000000-0000-4000-8000-000000000002";
    db.tables.conversations.push({ ...db.tables.conversations[0], id: newConversation, lead_id: null });
    db.tables.commerce_sessions[0].lead_phone = "stale-phone";
    const context = await resolve(api, { lead_id: undefined, conversation_id: newConversation });
    expect(context).toMatchObject({ leadId: null, conversationId: newConversation, leadPhone: null });
    expect(context.commerceSessionId).not.toBe(sessionId);
    expect(db.tables.commerce_sessions[0]).toMatchObject({ lead_id: leadId, conversation_id: conversationId });
    expect(db.tables.commerce_sessions[1]).toMatchObject({ lead_id: null, conversation_id: newConversation, lead_phone: null });
  });

  it("does not attach a different conversation's unidentified session to a known lead", async () => {
    const { api, db } = setup();
    db.tables.commerce_sessions[0].lead_id = null;
    db.tables.commerce_sessions[0].conversation_id = "40000000-0000-4000-8000-000000000002";
    const context = await resolve(api, { conversation_id: conversationId });
    expect(context.commerceSessionId).not.toBe(sessionId);
    expect(db.tables.commerce_sessions[0].lead_id).toBeNull();
  });

  it("does not resolve an explicit lead through a legacy session's different conversation", async () => {
    const { api, db } = setup();
    db.tables.commerce_sessions[0].lead_id = null;
    const context = await resolve(api, { lead_id: otherLead });
    expect(context).toMatchObject({ leadId: otherLead, conversationId: null });
    expect(context.commerceSessionId).not.toBe(sessionId);
    expect(db.tables.commerce_sessions[0]).toMatchObject({ lead_id: null, conversation_id: conversationId });
    expect(await api.loadWhatsappConversationMessages(context)).toEqual([]);
  });

  it("retains legacy messages linked only to the same conversation across sessions", async () => {
    const { api, db } = setup();
    db.tables.commerce_agent_messages = [
      { id: "legacy", organization_id: org, commerce_session_id: "old-session", lead_id: null, conversation_id: conversationId, role: "lead", content: "Quero jardim", created_at: "2026-09-11" },
      { id: "wrong-lead", organization_id: org, commerce_session_id: "old-session", lead_id: otherLead, conversation_id: conversationId, role: "lead", content: "Não é deste lead", created_at: "2026-09-11" },
    ];
    const context = await resolve(api);
    expect((await api.loadRecentMessages(context)).map(row => row.id)).toEqual(["legacy"]);
  });

  it("links anonymous messages from the identified session without changing other people's history", async () => {
    const { api, db } = setup();
    db.tables.commerce_sessions[0].lead_id = null;
    db.tables.commerce_sessions[0].conversation_id = null;
    db.tables.commerce_agent_messages = [
      { id: "anonymous", organization_id: org, commerce_session_id: sessionId, lead_id: null, conversation_id: null, role: "lead", content: "Preciso de varanda", created_at: "2026-09-11" },
      { id: "other", organization_id: org, commerce_session_id: sessionId, lead_id: otherLead, conversation_id: null, role: "lead", content: "Não pertence a este lead", created_at: "2026-09-11" },
      { id: "different-session", organization_id: org, commerce_session_id: "elsewhere", lead_id: null, conversation_id: null, role: "lead", content: "Anônimo separado", created_at: "2026-09-11" },
    ];
    const context = await resolve(api);
    expect(db.tables.commerce_agent_messages[0]).toMatchObject({ lead_id: leadId, conversation_id: conversationId });
    expect(db.tables.commerce_agent_messages[1].lead_id).toBe(otherLead);
    expect(db.tables.commerce_agent_messages[2].lead_id).toBeNull();
    expect((await api.loadRecentMessages(context)).map(row => row.id)).toEqual(["anonymous"]);
  });

  it("does not reuse a different lead's browser session or its order context", async () => {
    const { api, db } = setup();
    db.tables.commerce_sessions[0].lead_id = otherLead;
    db.tables.commerce_sessions[0].conversation_id = null;
    db.tables.commerce_sessions[0].order_id = "old-order";
    const context = await resolve(api);
    expect(context.commerceSessionId).not.toBe(sessionId);
    expect(context.orderId).toBeNull();
    expect(context.leadPhone).toBeNull();
    expect(db.tables.commerce_sessions[0].lead_id).toBe(otherLead);
  });

  it("does not claim persisted messages or a usable session after database failure", async () => {
    const failed = setup("dentista", { table: "commerce_agent_messages", operation: "insert" });
    const context = await resolve(failed.api);
    await expect(failed.api.persistCommerceAgentMessage({ context, role: "lead", content: "Olá" })).rejects.toThrow("histórico");
    const noSession = setup("dentista", { table: "commerce_sessions", operation: "update" });
    expect(await noSession.api.resolveCommerceAgentContext({ organization_id: org, surface: "store", lead_id: leadId, commerce_session_id: sessionId })).toMatchObject({ ok: false, status: 503 });
    await expect(failed.api.persistCommerceAgentMessage({ context: { ...context, commerceSessionId: null }, role: "lead", content: "Olá" })).rejects.toThrow("histórico");
  });

  it("rejects a concurrent browser identity change instead of overwriting it", async () => {
    const { api, db } = setup();
    const context = await resolve(api);
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = table => {
      const query = originalFrom(table);
      if (table === "commerce_sessions") {
        const update = query.update.bind(query);
        query.update = payload => {
          db.tables.commerce_sessions[0].lead_id = otherLead;
          return update(payload);
        };
      }
      return query;
    };
    await expect(api.ensureCommerceSession(context)).rejects.toThrow("histórico");
    expect(db.tables.commerce_sessions[0].lead_id).toBe(otherLead);
  });

  it("does not find a WhatsApp conversation across organizations", async () => {
    const { api, db } = setup();
    db.tables.commerce_sessions = [];
    db.tables.conversations[0].organization_id = "other-organization";
    const context = await resolve(api, { commerce_session_id: undefined });
    expect(context.conversationId).toBeNull();
    expect(await api.loadWhatsappConversationMessages(context)).toEqual([]);
    expect(context.client).toBe(db.client as unknown as SupabaseClient);
  });
});
