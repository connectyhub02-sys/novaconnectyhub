import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const goodbye = { id: "bye", direction: "inbound", text_content: "Obrigado, tchau!", conversation_id: "conversation", occurred_at: "2026-09-28T12:00:00Z" };

function setup(lead: { phone_number: string; display_name: string; metadata?: Record<string, unknown> }) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(String(init.body ?? "{}")) });
    return new Response(JSON.stringify({ id: `sent-${calls.length}`, success: true }), { status: 200 });
  });
  const db = commerceDatabase({
    agent_runs: [{ id: "run", metadata: {} }], conversations: [{ id: "conversation" }], conversation_messages: [goodbye],
    leads: [{ id: "lead", organization_id: "org", updated_at: "2026-09-28T11:00:00Z", metadata: {}, ...lead }],
  });
  const runtime = runtimeHarness({}, { fetch });
  const context = {
    run: { id: "run" }, organization: { id: "org", name: "Buffalo Mass" }, instance: { id: "instance", phone_number: "5511910188233" },
    agent: { id: "agent", name: "Gustavo", persona_name: "Gustavo" }, behavior: {},
    lead: { id: "lead", ...lead, metadata: lead.metadata ?? {} }, messages: [goodbye], conversationId: "conversation",
    credentials: { baseUrl: "https://provider.invalid" }, linkButtons: [],
  };
  const end = () => runtime<Promise<unknown>>("handleConversationEnding", { client: db.client, context, latestInbound: goodbye, userText: goodbye.text_content, token: "test", phone: "5511999990000" });
  return { calls, db, end, context };
}

describe("lead contact saving", () => {
  it("saves the lead with their personal name and asks them, once, to save our card", async () => {
    const { calls, db, end, context } = setup({ phone_number: "5511999990000", display_name: "Marina Souza" });
    expect(await end()).toMatchObject({ sent: true, reason: "conversation_ended" });
    expect(calls.find(call => call.path === "/contact/add")?.body).toEqual({ number: "5511999990000", name: "Marina Souza" });
    const card = calls.find(call => call.path === "/send/contact")?.body;
    expect(card).toMatchObject({ number: "5511999990000", fullName: "Buffalo Mass (Gustavo)", phoneNumber: "5511910188233", organization: "Buffalo Mass" });
    const lead = db.tables.leads[0].metadata as Record<string, Record<string, Record<string, unknown>>>;
    expect(lead.device_contacts.instance).toMatchObject({ name: "Marina Souza" });
    expect(lead.contact_card_requests.instance.sent_at).toBeTruthy();

    // A later goodbye in the same conversation never repeats the card or the address-book save.
    context.messages = [{ ...goodbye, id: "bye-2", occurred_at: "2026-09-29T12:00:00Z" }] as never;
    calls.length = 0;
    await end();
    expect(calls.some(call => call.path === "/contact/add" || call.path === "/send/contact")).toBe(false);
  }, 15000);

  it("never saves a business profile name or a WhatsApp internal id as a phone", async () => {
    const business = setup({ phone_number: "5511999990000", display_name: "Distribuidora Alfa LTDA" });
    await business.end();
    expect(business.calls.some(call => call.path === "/contact/add")).toBe(false);

    const internalId = setup({ phone_number: "172893958877229", display_name: "Marina Souza" });
    await internalId.end();
    expect(internalId.calls.some(call => call.path === "/contact/add")).toBe(false);
  }, 15000);
});
