import { describe, expect, it, vi } from "vitest";
import { findLeadNameEvidence, resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Agenda from "@/lib/automations/agenda-agent";

const msg = (direction: string, text_content: string, id = "latest") => ({ id, direction, text_content, occurred_at: "2026-09-11T23:00:00Z", message_type: "text" });
const legacy = { person_name: "Renata Macedo", name: "Renata Macedo", lead_memory: { personName: "Renata Macedo", source: "whatsapp_agent_memory" } };

describe("shared lead identification", () => {
  it.each([
    "Para liberar o pagamento, falta nome completo.",
    "Para liberar o pagamento, faltam nome completo e e-mail.",
    "Me informe seu nome completo para concluir.",
  ])("captures the name requested by checkout: %s", async prompt => {
    const latest = msg("inbound", "Carlos Almeida Santos");
    const messages = [msg("outbound", prompt, "question"), latest];
    expect(findLeadNameEvidence(messages)).toMatchObject({ name: "Carlos Almeida Santos", messageId: "latest" });
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "org", metadata: {} }] });
    const context = { lead: { id: "lead", display_name: null, metadata: {} }, agent: { name: "Atendimento" }, organization: { id: "org" }, messages, salesCatalog: [], salesCatalogOrders: [], behavior: { leadMemory: false } };
    await runtimeHarness()("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: db.client, context, userText: latest.text_content });
    expect(db.tables.leads[0].metadata).toMatchObject({ person_name: "Carlos Almeida Santos", lead_name_evidence: { source: "lead_message" } });
  });
  it("recognizes a name request split into outbound bubbles without using a stale request", () => {
    expect(findLeadNameEvidence([msg("outbound", "Para liberar o pagamento, falta nome completo.", "question"), msg("outbound", "Depois preparo o acesso ao pagamento.", "explanation"), msg("inbound", "Carlos Almeida Santos")])?.name).toBe("Carlos Almeida Santos");
    expect(findLeadNameEvidence([msg("outbound", "Qual seu nome?", "question"), msg("inbound", "Não quero informar", "refusal"), msg("outbound", "Qual produto você quer?", "product"), msg("inbound", "Caderno Azul")])).toBeNull();
  });
  it.each(["então preciso mudar", "quero comprar um imóvel", "estou buscando casa"])("does not record a sentence answering the name question as a name: %s", text => {
    const question = msg("outbound", "Como posso te chamar? Me diz também se você procura um imóvel para morar ou investir.", "question");
    expect(findLeadNameEvidence([question, msg("inbound", text)])).toBeNull();
  });
  it("keeps the full name from a spoken declaration after an untranscribed audio (Gustavo, 23/09 20:49)", () => {
    const messages = [msg("outbound", "Qual o seu nome? Só para eu atualizar seu cadastro por aqui.", "question"), msg("inbound", "", "audio"),
      msg("inbound", "Aí, meu nome é Magno, Magno Macedo.")];
    expect(findLeadNameEvidence(messages)?.name).toBe("Magno Macedo");
    expect(findLeadNameEvidence([msg("outbound", "Qual o seu nome?", "q"), msg("inbound", "", "audio"), msg("inbound", "Magno Macedo")])?.name).toBe("Magno Macedo");
  });
  it("accepts 'Sou Fulano' as the answer to the name question (Gustavo, 24/09 11:56)", () => {
    const question = msg("outbound", "Qual o seu nome? Me fala aí também qual é o seu objetivo fitness.", "question");
    expect(findLeadNameEvidence([question, msg("inbound", "Sou magno macedo")])?.name).toBe("Magno Macedo");
    expect(findLeadNameEvidence([question, msg("inbound", "Sou corretor")])).toBeNull();
  });
  it.each([
    "Rua 1131, numero 61 cep 88330786 bairro centro cidade balneario camboriu\nMagno macedo gomes\n52998224725\ncliente@example.com",
    "Magno macedo gomes\nRua 1131, numero 61 cep 88330786 centro balneario camboriu\n52998224725\ncliente@example.com",
    "52998224725\ncliente@example.com\nRua 1131, numero 61 cep 88330786 centro\nMagno macedo gomes",
  ])("finds the name in an address-and-billing reply in any order: %#", text => {
    expect(runtimeHarness()("extractRuntimeCustomerNameFromStructuredReply", text)).toBe("Magno macedo gomes");
  });
  it.each(["Magno", "Maria da Silva", "João dos Santos"])("still accepts a real name: %s", name => {
    expect(findLeadNameEvidence([msg("outbound", "Como posso te chamar?", "question"), msg("inbound", name)])?.name).toBe(name);
  });
  it.each([null, "Magno Gomes"])("only attempts to reserve after identification: %s", async leadName => {
    const start = "2099-01-02T12:00:00Z";
    const db = commerceDatabase({ customer_agenda_settings: [{ organization_id: "org", enabled: true }], customer_agenda_offers: [{ organization_id: "org", conversation_id: "conversation", lead_id: "lead", resource_id: "resource", expires_at: "2099-01-01T00:00:00Z", slots: [{ starts_at: start, ends_at: "2099-01-02T13:00:00Z" }], party_size: 1 }] });
    const rpc = vi.fn(async () => ({ error: { message: "Slot no longer available" } }));
    const api = serverModuleHarness<typeof Agenda>("src/lib/automations/agenda-agent.ts", {
      "./agenda": { availableAppointments: async () => [{starts_at:start,ends_at:"2099-01-02T13:00:00Z"}], getAgenda: async () => ({ bookings: [], resources: [{ id: "resource", enabled: true, name: "Visita" }], settings: { enabled: true, timezone: "America/Sao_Paulo" } }), agendaErrorMessage: (message: string) => message },
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

describe("returns asked by the lead and birthday answer", () => {
  const message = (id: string, direction: string, text: string, minutesAgo: number) => ({ id, direction, text_content: text, provider_message_id: id,
    provider_chat_id: "chat", message_type: "text", payload: {}, occurred_at: new Date(Date.now() - minutesAgo * 60000).toISOString() });

  it("registers a return with the lead's own words when asked to be called later", async () => {
    const run = runtimeHarness();
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    const inbound = message("in", "inbound", "agora não dá, me chama mês que vem", 0);
    await run("captureLeadReturnAndBirthday", { rpc }, { organization: { id: "org" }, lead: { id: "lead", metadata: {} }, messages: [inbound] }, inbound);
    expect(rpc).toHaveBeenCalledWith("record_customer_visit_v2", expect.objectContaining({ p_description: "Pediu para ser chamado", p_kind: "visit",
      p_key: "agent-return:in", p_note: "agora não dá, me chama mês que vem", p_source: "agent" }));
  });

  it("keeps the birthday only as an answer to our question", async () => {
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "org", metadata: { birthday_asked_at: new Date().toISOString() } }] });
    const client = Object.assign(db.client, { rpc: vi.fn() });
    const run = runtimeHarness();
    const question = message("q", "outbound", "Ah, e se quiser, me passa o dia do seu aniversário (dia e mês) que eu te mando uma mensagem especial nesse dia 🎉", 2);
    const answer = message("a", "inbound", "é 15/03", 0);
    const context = { organization: { id: "org" }, lead: { id: "lead", metadata: db.tables.leads[0].metadata }, messages: [question, answer] };
    await run("captureLeadReturnAndBirthday", client, context, answer);
    expect(db.tables.leads[0].metadata).toMatchObject({ birthday: { day: 15, month: 3, source: "whatsapp_question" } });

    const other = commerceDatabase({ leads: [{ id: "lead", organization_id: "org", metadata: { birthday_asked_at: new Date().toISOString() } }] });
    const unrelated = message("b", "inbound", "pode entregar dia 15/03?", 0);
    await run("captureLeadReturnAndBirthday", Object.assign(other.client, { rpc: vi.fn() }),
      { organization: { id: "org" }, lead: { id: "lead", metadata: other.tables.leads[0].metadata }, messages: [message("x", "outbound", "Seu pedido está confirmado.", 2), unrelated] }, unrelated);
    expect(other.tables.leads[0].metadata).not.toHaveProperty("birthday");
  });
});
