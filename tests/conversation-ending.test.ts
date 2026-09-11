import { describe, expect, it, vi } from "vitest";
import { conversationEnding, conversationEndingAction } from "../src/lib/whatsapp/conversation-ending";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const inbound = (text: string, id = "latest") => ({ id, direction: "inbound", text_content: text });
const outbound = (text: string) => ({ direction: "outbound", text_content: text });

describe("conversation ending shared by attendance and follow-up", () => {
  it("persists one final reply, then completes subsequent courtesy runs without transport", async () => {
    const first = { ...inbound("Obrigado, tchau!"), conversation_id: "conversation", occurred_at: "2026-09-11T12:00:00Z" };
    const db = commerceDatabase({ agent_runs: [{ id: "run", metadata: {} }], conversations: [{ id: "conversation" }], conversation_messages: [first] });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "sent-farewell" }), { status: 200 }));
    const runtime = runtimeHarness({}, { fetch });
    const context = { run: { id: "run" }, organization: { id: "org" }, instance: { id: "instance" }, agent: { id: "agent", name: "Agente" }, lead: null, messages: [first], conversationId: "conversation", credentials: { baseUrl: "https://provider.invalid" } };
    const invoke = (latestInbound: unknown, userText: string) => runtime<Promise<unknown>>("handleConversationEnding", { client: db.client, context, latestInbound, userText, token: "test", phone: "test" });
    expect(await invoke(first, first.text_content)).toMatchObject({ sent: true, reason: "conversation_ended" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.tables.conversation_messages.at(-1)?.payload).toMatchObject({ runtime_event: { type: "conversation_ending" } });
    const next = { ...first, id: "thanks-again", text_content: "Ok, agradeço!", occurred_at: "2099-09-11T12:01:00Z" };
    db.tables.conversation_messages.push(next);
    context.messages = db.tables.conversation_messages as typeof context.messages;
    expect(await invoke(next, next.text_content)).toMatchObject({ skipped: true, reason: "conversation_already_ended" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = { ...next, id: "new-request", text_content: "Quero agendar outra visita", occurred_at: "2099-09-11T12:02:00Z" };
    db.tables.conversation_messages.push(request);
    expect(await invoke(request, request.text_content)).toBeNull();
  });
  it("closes when the agent says goodbye even without any customer response", () => {
    expect(conversationEnding([outbound("Obrigado, até a próxima!")])).toEqual({ ended: true, acknowledged: true });
    expect(conversationEnding([outbound("Obrigado, Ana. Até a próxima!")]).ended).toBe(true);
    expect(conversationEnding([outbound("Me confirma o endereço. Até mais!")]).ended).toBe(false);
  });
  it("allows one farewell and silences the repeated courtesy loop", () => {
    const history = [outbound("O endereço fica no centro."), inbound("Obrigado, tchau!")];
    expect(conversationEndingAction(history, "latest", "Obrigado, tchau!")).toBe("close");
    history.push(outbound("Por nada! Até mais."));
    for (const [i, text] of ["Ok!", "Agradeço!", "Obrigado!", "👍", "Até a próxima!"].entries()) {
      history.push(inbound(text, `courtesy-${i}`));
      expect(conversationEndingAction(history, `courtesy-${i}`, text)).toBe("silence");
    }
    expect(conversationEnding(history).ended).toBe(true);
  });
  it.each(["Ok, qual o valor?", "Obrigado, mas preciso trocar o endereço", "Quero comprar outro", "Oi, preciso de ajuda", "Não deu certo", "Bom dia!"])("reopens for a new need: %s", text => {
    const messages = [outbound("De nada, se precisar estou aqui!"), inbound(text)];
    expect(conversationEndingAction(messages, "latest", text)).toBe("continue");
    expect(conversationEnding(messages).ended).toBe(false);
  });
  it.each(["Ok!", "Sim", "Combinado", "Obrigado!"])("does not silence a reply to a pending question: %s", text => {
    const messages = [outbound("Posso confirmar a visita para amanhã?"), inbound(text)];
    expect(conversationEndingAction(messages, "latest", text)).toBe("continue");
    expect(conversationEnding(messages).ended).toBe(false);
  });
  it("does not mistake an ordinary greeting or a question with a courtesy for a farewell", () => {
    expect(conversationEnding([outbound("Bom dia!")]).ended).toBe(false);
    expect(conversationEnding([outbound("Obrigado! Qual bairro você procura?")]).ended).toBe(false);
  });
  it("preserves an unanswered request preceding a courtesy in the same inbound burst", () => {
    const messages = [outbound("Até mais!"), inbound("Qual o preço?", "question"), inbound("Obrigado!")];
    expect(conversationEndingAction(messages, "latest", "Obrigado!")).toBe("continue");
  });
  it("does not discard an attachment carrying a courtesy caption", () => {
    const messages = [outbound("Até mais!"), { ...inbound("Obrigado!"), message_type: "image" }];
    expect(conversationEndingAction(messages, "latest", "Obrigado!")).toBe("continue");
    expect(conversationEnding(messages).ended).toBe(false);
  });
  it("does not schedule another abandonment timer after farewell, but does after a new request", async () => {
    const policy = vi.fn(async () => ({ follow_up_enabled: true }));
    const enqueue = vi.fn(async () => {});
    const runtime = runtimeHarness({
      "@/lib/automations/dispatch": { loadAutomationPolicy: policy },
      "@/lib/supabase/service": { createServiceClient: () => ({}) },
      "./proactive-followup": { enqueueWhatsappFollowUp: enqueue },
    });
    const context = { lead: { id: "lead" }, behavior: { agentEnabled: true, followUpDelayMinutes: 120 }, organization: { id: "org" }, instance: { id: "instance" }, agent: { id: "agent" }, run: { id: "run" }, conversationId: "conversation", messages: [inbound("Obrigado!")] };
    await runtime("scheduleProactiveFollowUp", context, "Obrigado, até a próxima!");
    expect(policy).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    context.messages = [inbound("Quero agendar uma visita")];
    await runtime("scheduleProactiveFollowUp", context, "Qual dia você prefere?");
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
