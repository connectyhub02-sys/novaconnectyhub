import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as agentBehavior from "../src/lib/whatsapp/agent-behavior";
import * as conversationEnding from "../src/lib/whatsapp/conversation-ending";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type HumanIntervention = typeof import("../src/lib/whatsapp/human-intervention");

const minute = 60_000;
const t0 = Date.parse("2026-09-22T14:04:11Z");
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

function fixture(messages: Array<{ direction: string; text: string; at: number }>, state: Record<string, unknown>) {
  const db = commerceDatabase({
    conversations: [{ id: "conversation", metadata: { human_intervention: { active: true, ...state } } }],
    conversation_messages: messages.map((m, i) => ({ id: `m${i}`, conversation_id: "conversation", direction: m.direction,
      text_content: m.text, message_type: "Conversation", payload: {}, occurred_at: iso(m.at) })),
  });
  const intervention = serverModuleHarness<HumanIntervention>("src/lib/whatsapp/human-intervention.ts",
    { "./agent-behavior": agentBehavior, "./conversation-ending": conversationEnding }, [], { Date });
  const schedule = (at: number) => intervention.scheduleHumanInterventionAutoResumeForLead({
    client: db.client as never, conversationId: "conversation", messageOccurredAt: iso(at), providerMessageId: "provider" });
  const human = () => (db.tables.conversations[0].metadata as { human_intervention: Record<string, unknown> }).human_intervention;
  return { db, schedule, human };
}

describe("human takeover resume rule", () => {
  it("does not interrupt a human mid-negotiation: the lead waits for the configured window (Renata, 22/09)", async () => {
    vi.setSystemTime(t0 + 2 * minute);
    const f = fixture([
      { direction: "outbound", text: "Qual total de m²", at: t0 - 5 * minute },
      { direction: "inbound", text: "7.200m2 total", at: t0 - 4 * minute },
      { direction: "outbound", text: "Pede quanto", at: t0 },
      { direction: "inbound", text: "82 mil em cada um", at: t0 + 80_000 },
    ], { paused_until: iso(t0 + 60 * minute) });
    const result = await f.schedule(t0 + 80_000);
    expect(result?.resumeAt).toBe(iso(t0 + 60 * minute));
    expect(f.human()).toMatchObject({ auto_resume_rule: "window_end", paused_until: iso(t0 + 60 * minute) });
  });

  it("answers in 5 minutes when the lead returns after the human said goodbye", async () => {
    vi.setSystemTime(t0 + 11 * minute);
    const f = fixture([
      { direction: "inbound", text: "Obrigado pela ajuda", at: t0 - minute },
      { direction: "outbound", text: "Por nada! Até mais.", at: t0 },
      { direction: "inbound", text: "Ah, tem entrega no sábado?", at: t0 + 10 * minute },
    ], { paused_until: iso(t0 + 60 * minute) });
    const result = await f.schedule(t0 + 10 * minute);
    expect(result?.resumeAt).toBe(iso(t0 + 15 * minute));
    expect(f.human()).toMatchObject({ auto_resume_rule: "closed_conversation_fallback" });
  });

  it("keeps the 5-minute fallback when the lead sends a second unanswered message", async () => {
    vi.setSystemTime(t0 + 12 * minute);
    const f = fixture([
      { direction: "outbound", text: "Por nada! Até mais.", at: t0 },
      { direction: "inbound", text: "Ah, tem entrega no sábado?", at: t0 + 10 * minute },
      { direction: "inbound", text: "?", at: t0 + 11 * minute },
    ], { paused_until: iso(t0 + 15 * minute), lead_waiting_since: iso(t0 + 10 * minute) });
    const result = await f.schedule(t0 + 11 * minute);
    expect(result?.resumeAt).toBe(iso(t0 + 15 * minute));
  });

  it("tells the agent to continue a prospecting conversation in the company's role, without restarting it", () => {
    const runtime = runtimeHarness();
    const metadata = { human_intervention: { active: true, last_human_message_at: iso(t0), auto_resume_reason: "lead_unanswered_after_handoff" } };
    const messages = [
      { id: "a", direction: "outbound", text_content: "Olá! Posso ter mais informações sobre isso?", payload: { fromMe: true } },
      { id: "b", direction: "inbound", text_content: "Cada lote 360m2", payload: {} },
      { id: "c", direction: "outbound", text_content: "Pede quanto", payload: { fromMe: true } },
      { id: "d", direction: "inbound", text_content: "82 mil em cada um", payload: {} },
    ];
    const lines = runtime<string[]>("buildHumanHandbackInstruction", metadata, messages).join("\n");
    expect(lines).toContain("Não cumprimente de novo");
    expect(lines).toContain("iniciada pela empresa");
    messages.push({ id: "e", direction: "outbound", text_content: "Entendi!", payload: { agent_run_id: "run" } as never });
    expect(runtime<string[]>("buildHumanHandbackInstruction", metadata, messages)).toEqual([]);
  });

  it("keeps runtime notes out of the request forwarded to the responsible person", () => {
    const text = ["Nota interna: o lead cobrou resposta com \"?\".", "Pedido anterior ainda sem resposta completa: sim vamos marcar quando podemos marcar",
      "Responda agora ao pedido anterior de forma objetiva, comercial e completa, sem pedir para o lead repetir."].join("\n");
    expect(runtimeHarness()("stripRuntimeNotes", text)).toBe("sim vamos marcar quando podemos marcar");
  });

  it("never resumes an open-ended manual takeover while the conversation is active", async () => {
    vi.setSystemTime(t0 + 2 * minute);
    const f = fixture([
      { direction: "outbound", text: "Pede quanto", at: t0 },
      { direction: "inbound", text: "82 mil em cada um", at: t0 + minute },
    ], {});
    expect(await f.schedule(t0 + minute)).toBeNull();
  });
});
