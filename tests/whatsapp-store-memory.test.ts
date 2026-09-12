import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it, vi } from "vitest";
import * as leadNames from "@/lib/whatsapp/lead-names";
import * as metadataUpdate from "@/lib/leads/metadata-update";
import type * as CommerceServer from "@/lib/commerce-agent/server";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type StoreMessage = { id?: string; speaker: "lead" | "agent" | "system"; text: string; surface: string | null; agentName: string | null; occurredAt: string };
type StoreContext = { messages: StoreMessage[]; sessions: unknown[]; latestSessionAt: string | null };
type StoreRuntime = {
  loadLeadCommerceStoreContext: (client: unknown, input: { organizationId: string; leadId: string | null; conversationId: string | null }) => Promise<StoreContext | null>;
  buildCommerceStoreContextLines: (context: StoreContext | null, agent: unknown) => string[];
  extractLeadMemory: (client: unknown, context: unknown, userText: string) => Promise<void>;
  buildLeadMemoryLines: (lead: unknown, behavior: unknown) => string[];
};
const scope = { organizationId: "org", leadId: "lead", conversationId: "conversation" };
const message = (text_content: string, direction = "inbound", id = "whatsapp-inbound") => ({
  id, text_content, direction, message_type: "text", occurred_at: "2026-09-12T01:20:00Z",
});

function harness(output: Record<string, unknown> = { summary: "Prefere imóvel térreo com quintal; retomar comparação." }) {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 }));
  const meter = vi.fn<(...args: unknown[]) => Promise<null>>(async () => null);
  const api = serverModuleHarness<StoreRuntime>("src/lib/whatsapp/agent-runtime.ts", {
    "node:async_hooks": { AsyncLocalStorage },
    "./lead-names": leadNames,
    "@/lib/leads/metadata-update": metadataUpdate,
    "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: meter },
  }, ["loadLeadCommerceStoreContext", "buildCommerceStoreContextLines", "extractLeadMemory", "buildLeadMemoryLines"], { fetch });
  const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "org", metadata: {} }] });
  const store = serverModuleHarness<typeof CommerceServer>("src/lib/commerce-agent/server.ts");
  const storeContext = {
    ok: true, client: db.client, organization: { id: "org" }, commerceSessionId: "session", leadId: "lead", conversationId: "conversation",
    agentId: "agent", agentName: "Luna", surface: "product", pagePath: "/produto/imovel", visitorId: "visitor", sessionId: "browser-session",
  } as never;
  async function persist(role: "lead" | "assistant", content: string) {
    const result = await store.persistCommerceAgentMessage({ context: storeContext, role, content });
    const rows = db.tables.commerce_agent_messages;
    rows.at(-1)!.created_at = `2026-09-12T01:${String(rows.length).padStart(2, "0")}:00Z`;
    return result?.id;
  }
  function whatsappContext(commerceStoreContext: StoreContext | null, messages = [message("Podemos continuar de onde paramos?")]) {
    return { organization: { id: "org" }, instance: { metadata: {} }, agent: { id: "agent", name: "Luna", model_id: "test" }, run: { id: "run" },
      lead: { id: "lead", metadata: {} }, conversationId: "conversation", messages, commerceStoreContext,
      behavior: { leadMemory: true }, geminiCredentials: { apiKey: "fake", model: "test" } };
  }
  return { api, db, fetch, meter, persist, whatsappContext };
}

describe("storefront conversation returned to WhatsApp and durable lead memory", () => {
  it("uses persisted store facts in the shared WhatsApp memory request, including details beyond 320 characters", async () => {
    const h = harness({ summary: "Prefere imóvel térreo com quintal", preferences: ["Imóvel térreo com quintal"], personName: "Luna" });
    await h.persist("assistant", "Sou Luna. Posso sugerir um apartamento, se você gostar.");
    const preference = `${"Ainda estou comparando as opções e vendo as fotos. ".repeat(9)}Prefiro imóvel térreo com quintal, apartamento não serve.`;
    const sourceId = await h.persist("lead", preference);
    const storeContext = await h.api.loadLeadCommerceStoreContext(h.db.client, scope);
    expect(storeContext?.messages.at(-1)?.text).toBe(preference);
    expect(h.api.buildCommerceStoreContextLines(storeContext, { name: "Luna" }).join("\n")).toContain("Prefiro imóvel térreo com quintal");

    const context = h.whatsappContext(storeContext);
    await h.api.extractLeadMemory(h.db.client, context, "Podemos continuar de onde paramos?");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.meter).toHaveBeenCalledTimes(1);
    const metering = h.meter.mock.calls[0][0] as unknown as { promptText: string; requestId: string; metadata: unknown };
    expect(metering.promptText).toContain(preference);
    expect(metering.promptText).toContain('"author":"lead"');
    expect(metering.promptText).toContain('"author":"agent"');
    expect(metering.promptText).not.toContain("browser-session");
    expect(metering).toMatchObject({ requestId: "whatsapp-agent:run:gemini:lead_memory", metadata: { input_channels: ["whatsapp", "storefront"], storefront_message_count: 2 } });
    expect(h.db.tables.leads[0].metadata).toMatchObject({ lead_memory: { summary: "Prefere imóvel térreo com quintal", personName: null, storefront_message_ids: expect.arrayContaining([sourceId]) } });
    expect(leadNames.resolveLeadPersonalName(context.lead)).toBeNull();
    expect(h.api.buildLeadMemoryLines(context.lead, { leadMemory: true }).join("\n")).toContain("Imóvel térreo com quintal");
  });

  it.each(["Meu nome é Magno Gomes", "Meu nome é Luna"])('accepts explicit storefront self-identification: "%s"', async text => {
    const h = harness();
    await h.persist("assistant", "Sou Luna. Como posso ajudar?");
    const id = await h.persist("lead", text);
    const context = h.whatsappContext(await h.api.loadLeadCommerceStoreContext(h.db.client, scope));
    await h.api.extractLeadMemory(h.db.client, context, "Podemos continuar?");
    expect(h.db.tables.leads[0]).toMatchObject({ display_name: text.slice("Meu nome é ".length), metadata: { lead_name_evidence: { source: "lead_message", channel: "storefront", message_id: id } } });
  });

  it("does not turn a name mention into self-identification across channels", async () => {
    const h = harness({ summary: "Quer comparar as opções", personName: "Luna" });
    await h.persist("lead", "Luna");
    const context = h.whatsappContext(await h.api.loadLeadCommerceStoreContext(h.db.client, scope), [message("Como posso te chamar?", "outbound", "name-question"), message("Depois te digo")]);
    await h.api.extractLeadMemory(h.db.client, context, "Depois te digo");
    expect(leadNames.resolveLeadPersonalName(context.lead)).toBeNull();
    expect(h.db.tables.leads[0].metadata).not.toHaveProperty("lead_name_evidence");
  });

  it("includes unassigned legacy conversation history without borrowing another lead's data", async () => {
    const h = harness();
    await h.persist("lead", "Prefiro quintal.");
    h.db.tables.commerce_agent_messages.push(
      { id: "legacy", organization_id: "org", lead_id: null, conversation_id: "conversation", role: "lead", content: "Também preciso de garagem.", created_at: "2026-09-12T01:05:00Z" },
      { id: "wrong-conversation", organization_id: "org", lead_id: null, conversation_id: "other-conversation", role: "lead", content: "PRIVATE OTHER CONVERSATION", created_at: "2099-01-01" },
      { id: "wrong-lead", organization_id: "org", lead_id: "other-lead", conversation_id: "conversation", role: "lead", content: "PRIVATE OTHER LEAD", created_at: "2099-01-01" },
      { id: "wrong-org", organization_id: "other-org", lead_id: "lead", conversation_id: "conversation", role: "lead", content: "PRIVATE OTHER ORG", created_at: "2099-01-01" },
    );
    h.db.tables.commerce_sessions = [
      { id: "legacy-session", organization_id: "org", lead_id: null, conversation_id: "conversation", current_path: "/produto/garagem", last_seen_at: "2026-09-12T01:05:00Z" },
      { id: "wrong-session", organization_id: "org", lead_id: "other-lead", conversation_id: "conversation", current_path: "/PRIVATE", last_seen_at: "2099-01-01" },
    ];
    const store = await h.api.loadLeadCommerceStoreContext(h.db.client, scope);
    expect(store?.messages).toHaveLength(2);
    expect(store?.messages.at(-1)?.text).toBe("Também preciso de garagem.");
    expect(JSON.stringify(store?.sessions)).toContain("/produto/garagem");
    expect(JSON.stringify(store)).not.toContain("PRIVATE");
  });

  it("bounds recent context without deleting the complete stored conversation", async () => {
    const h = harness();
    for (let i = 0; i < 12; i++) await h.persist("lead", `Message ${i} ${"Long context. ".repeat(350)}Final useful preference ${i}`);
    const store = await h.api.loadLeadCommerceStoreContext(h.db.client, scope);
    expect(store!.messages.reduce((sum, entry) => sum + entry.text.length, 0)).toBeLessThanOrEqual(8000);
    expect(h.db.tables.commerce_agent_messages).toHaveLength(12);
    expect(h.db.tables.commerce_agent_messages[0].content).toHaveLength(4000);
    expect(store?.messages.at(-1)?.text).toBe(h.db.tables.commerce_agent_messages.at(-1)?.content);
  });

  it("honors disabled memory while retaining the storefront continuity context", async () => {
    const h = harness();
    await h.persist("lead", "Prefiro imóvel térreo.");
    const context = h.whatsappContext(await h.api.loadLeadCommerceStoreContext(h.db.client, scope));
    context.behavior.leadMemory = false;
    await h.api.extractLeadMemory(h.db.client, context, "Podemos continuar?");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.meter).not.toHaveBeenCalled();
    expect(h.db.tables.leads[0].metadata).toEqual({});
    expect(h.api.buildCommerceStoreContextLines(context.commerceStoreContext, { name: "Luna" }).join("\n")).toContain("Prefiro imóvel térreo");
  });

  it("does not launch a separate extraction for a store-only conversation", async () => {
    const h = harness();
    await h.persist("lead", "Prefiro imóvel térreo.");
    const context = h.whatsappContext(await h.api.loadLeadCommerceStoreContext(h.db.client, scope), []);
    await h.api.extractLeadMemory(h.db.client, context, "");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.meter).not.toHaveBeenCalled();
  });
});
