import { describe, expect, it, vi } from "vitest";
import { findLeadNameEvidence, resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Agenda from "@/lib/automations/agenda-agent";

const msg = (direction: string, text_content: string, id = "latest") => ({ id, direction, text_content, occurred_at: "2026-09-11T23:00:00Z", message_type: "text" });
const legacy = { person_name: "Renata Macedo", name: "Renata Macedo", lead_memory: { personName: "Renata Macedo", source: "whatsapp_agent_memory" } };

describe("shared lead identification", () => {
  it.each([null, "Magno Gomes"])("only attempts to reserve after identification: %s", async leadName => {
    const start = "2099-01-02T12:00:00Z";
    const db = commerceDatabase({ customer_agenda_settings: [{ organization_id: "org", enabled: true }], customer_agenda_offers: [{ organization_id: "org", conversation_id: "conversation", lead_id: "lead", resource_id: "resource", expires_at: "2099-01-01T00:00:00Z", slots: [{ starts_at: start, ends_at: "2099-01-02T13:00:00Z" }], party_size: 1 }] });
    const rpc = vi.fn(async () => ({ error: { message: "Slot no longer available" } }));
    const api = serverModuleHarness<typeof Agenda>("src/lib/automations/agenda-agent.ts", {
      "./agenda": { getAgenda: async () => ({ bookings: [], resources: [{ id: "resource", enabled: true, name: "Visita" }], settings: { enabled: true, timezone: "America/Sao_Paulo" } }), agendaErrorMessage: (message: string) => message },
      "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: async () => null },
    }, [], { fetch: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ intent: "book", resourceId: "resource", startsAt: start }) }] } }] }) }) });
    const result = await api.processAgendaTurn({ client: { ...db.client, rpc } as never, organizationId: "org", conversationId: "conversation", leadId: "lead", leadName, agentId: "agent", runId: "run", credentials: { apiKey: "test", model: "test" } as never, userText: "Sim, confirmo", messages: [], assertCurrent: async () => {} });
    expect(rpc).toHaveBeenCalledTimes(leadName ? 1 : 0);
    expect(result?.booked).toBe(false);
    if (!leadName) expect(result?.fallback).toContain("como posso te chamar");
    expect(db.tables.customer_agenda_offers).toHaveLength(1);
  });
  it.each(["Renata Macedo", "Oi Renata", "Quero falar com Renata Macedo", "O nome dela é Renata Macedo"])("does not use a mention as identity: %s", text => {
    expect(findLeadNameEvidence([msg("outbound", "Sou Renata Macedo", "agent"), msg("inbound", text)])).toBeNull();
  });
  it.each(["Meu nome é Magno Gomes", "Me chamo Magno Gomes", "Pode me chamar de Magno Gomes"])("accepts self-identification: %s", text => {
    expect(findLeadNameEvidence([msg("inbound", text)])?.name).toBe("Magno Gomes");
  });
  it("accepts a name-only answer, including a confirmed namesake", () => {
    expect(findLeadNameEvidence([msg("outbound", "Como posso te chamar?", "question"), msg("inbound", "Renata Macedo")])).toMatchObject({ name: "Renata Macedo", messageId: "latest" });
  });
  it("does not accept a refusal as a name", () => {
    expect(findLeadNameEvidence([msg("outbound", "Qual seu nome?", "question"), msg("inbound", "Prefiro não informar")])).toBeNull();
  });
  it("ignores legacy inferred identity in all aliases but preserves an independent saved contact", () => {
    expect(resolveLeadPersonalName({ displayName: "Renata Macedo", metadata: legacy })).toBeNull();
    expect(resolveLeadPersonalName({ metadata: { ...legacy, person_name: "Magno Gomes" } })).toBe("Magno Gomes");
  });
  it.each([false, true])("rechecks an agent-name collision unless the lead confirmed it: %s", async confirmed => {
    const metadata = { person_name: "Renata Macedo", ...(confirmed ? { lead_name_evidence: { source: "lead_message", name: "Renata Macedo" } } : {}) };
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "org", metadata }] });
    const context = { lead: { id: "lead", display_name: "Renata Macedo", metadata }, agent: { name: "Renata Macedo" }, organization: { id: "org" }, messages: [msg("inbound", "Tem mais fotos?")], salesCatalog: [], salesCatalogOrders: [] };
    await runtimeHarness()("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: db.client, context, userText: "Tem mais fotos?" });
    expect(resolveLeadPersonalName(context.lead)).toBe(confirmed ? "Renata Macedo" : null);
    expect(db.tables.leads[0].metadata).toHaveProperty("person_name", "Renata Macedo");
  });
  it.each(["corretor_imoveis", "advogado", "dentista", "pizzaria"])("captures the reply without catalog, payment or enabled memory for %s", async activity => {
    const question = msg("outbound", "Como posso te chamar?", "question");
    const latest = msg("inbound", "Magno Gomes");
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "org", metadata: legacy }] });
    const context = { lead: { id: "lead", display_name: "Renata Macedo", metadata: legacy }, agent: { name: "Renata Macedo", metadata: { prompt_builder_config: { templateId: activity } } }, organization: { id: "org" }, messages: [question, latest], salesCatalog: [], salesCatalogOrders: [], behavior: { leadMemory: false } };
    await runtimeHarness()("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: db.client, context, userText: latest.text_content });
    expect(context.lead.display_name).toBe("Magno Gomes");
    expect(resolveLeadPersonalName(context.lead)).toBe("Magno Gomes");
    expect(db.tables.leads[0].metadata).toMatchObject({ person_name: "Magno Gomes", lead_name_evidence: { source: "lead_message" } });
  });
  it("rejects hallucinated agent identity from memory while keeping useful context", async () => {
    const update = vi.fn(async input => input.buildUpdate({}));
    const call = runtimeHarness({
      "@/lib/leads/metadata-update": { updateLeadMetadata: update },
      "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: async () => null },
    }, { fetch: async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ personName: "Renata Macedo", summary: "Busca imóvel" }) }] } }] }) }) });
    const context = { lead: { id: "lead", metadata: {} }, instance: { metadata: {} }, agent: { id: "agent" }, organization: { id: "org" }, run: { id: "run" }, conversationId: "conversation", behavior: { leadMemory: true }, messages: [msg("outbound", "Sou Renata Macedo", "agent"), msg("inbound", "Quero ver fotos")], geminiCredentials: { apiKey: "test", model: "test" } };
    await call("extractLeadMemory", {}, context, "Quero ver fotos");
    expect(resolveLeadPersonalName(context.lead)).toBeNull();
    expect(context.lead.metadata).toMatchObject({ lead_memory: { personName: null, summary: "Busca imóvel" } });
  });
  it("asks for the person behind a company and does not label an inferred name as confirmed", () => {
    const call = runtimeHarness();
    expect(call<string>("buildLeadNameContext", { display_name: "Empresa Exemplo", metadata: {} })).toContain("Pergunte de forma natural");
    expect(call<string[]>("buildLeadMemoryLines", { metadata: legacy }, { leadMemory: true }).join(" ")).not.toContain("Nome pessoal do lead:");
    expect(call<string>("buildLeadNameContext", { display_name: "Renata Macedo", metadata: legacy })).toContain("Pergunte uma vez");
  });
  it.each([null, "Magno Gomes", "refused"])("asks at closing only when appropriate: %s", async state => {
    const latest = msg("inbound", "Obrigado, tchau!");
    const db = commerceDatabase({ agent_runs: [{ id: "run", metadata: {} }], conversations: [{ id: "conversation" }], conversation_messages: [{ ...latest, conversation_id: "conversation" }] });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "sent" }), { status: 200 }));
    const context = { run: { id: "run" }, organization: { id: "org" }, instance: { id: "instance" }, agent: { id: "agent" }, lead: { id: "lead", metadata: state && state !== "refused" ? { person_name: state } : {} }, messages: [...(state === "refused" ? [msg("inbound", "Prefiro não informar meu nome", "refused")] : []), latest], conversationId: "conversation", credentials: { baseUrl: "https://provider.invalid" } };
    const call = runtimeHarness({}, { fetch });
    await call("handleConversationEnding", { client: db.client, context, latestInbound: latest, userText: latest.text_content, token: "test", phone: "test" });
    const sent = String(db.tables.conversation_messages.at(-1)?.text_content ?? "");
    expect(sent?.includes("Antes de encerrar")).toBe(state === null);
    const next = { ...latest, id: "bye", occurred_at: "2099-01-01T00:00:00Z" };
    db.tables.conversation_messages.push(next);
    context.messages = db.tables.conversation_messages as typeof context.messages;
    await call("handleConversationEnding", { client: db.client, context, latestInbound: next, userText: next.text_content, token: "test", phone: "test" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
