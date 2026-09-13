import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import * as agenda from "../src/lib/automations/agenda";
import type * as Agent from "../src/lib/automations/agenda-agent";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { agendaLocalInstant } from "../src/lib/automations/calendar-view";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2030-09-15T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
const start = "2030-09-16T16:00:00.000Z";
function fixture(options: { empty?: boolean; finish?: string; fail?: string } = {}) {
  const f = commerceDatabase({
    customer_agenda_settings: [{ organization_id: "org", enabled: true, timezone: "America/Sao_Paulo", default_resource_id: "resource" }],
    customer_agenda_resources: options.empty ? [] : [{ organization_id: "org", id: "resource", name: "Corretora", service_name: "Visita", enabled: true, kind: "service", duration_minutes: 60, capacity: 1, weekly_hours: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }], blocked_dates: [], location_address: "Rua de teste, 123", location_url: "https://maps.google.com/?q=local-teste" }],
    customer_agenda_bookings: [], customer_agenda_blocks: [], customer_agenda_offers: [], customer_agenda_turns: [],
  });
  let decision: Record<string, unknown> = { intent: "book", resourceId: "resource", startsAt: start };
  const fetch = vi.fn(async () => Response.json({ candidates: [{ finishReason: options.finish ?? "STOP", content: { parts: [{ text: JSON.stringify(decision) }] } }] }));
  const rpc = vi.fn(async (_name: string, p: Record<string, unknown>) => {
    if (options.fail) return { data: null, error: { message: options.fail } };
    const booking = { id: "booking", organization_id: "org", resource_id: p.p_resource, lead_id: p.p_lead, starts_at: p.p_start, ends_at: "2030-09-16T17:00:00.000Z", status: "booked", request_key: p.p_key, version: 1 };
    f.tables.customer_agenda_bookings.push(booking);
    return { data: booking, error: null };
  });
  const client = { rpc, from(table: string) {
    const q = f.client.from(table);
    if (["customer_agenda_offers", "customer_agenda_turns"].includes(table)) q.upsert = (value: Record<string, unknown>) => {
      const key = table === "customer_agenda_offers" ? "conversation_id" : "run_id";
      const old = f.tables[table].find(row => row[key] === value[key]);
      if (old) Object.assign(old, value); else f.tables[table].push({ ...value });
      return f.client.from(table);
    };
    return Object.assign(q, { delete: () => { f.tables[table] = []; return q; } });
  } };
  const agendaAgent = serverModuleHarness<typeof Agent>("src/lib/automations/agenda-agent.ts", { "./agenda": agenda, "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: vi.fn() } }, [], { fetch, Date });
  const input = { client, organizationId: "org", leadId: "lead", conversationId: "chat", runId: "run", agentId: "agent", leadName: "Magno", userText: "sim podemos marcar para amanha as 13 da tarde", messages: [], credentials: { model: "fake", apiKey: "not-real" }, assertCurrent: vi.fn(), catalogAppointment: true };
  return { ...f, rpc, fetch, input, decide: (value: Record<string, unknown>) => { decision = value; }, turn: (extra = {}) => agendaAgent.processAgendaTurn({ ...input, ...extra } as never) };
}

describe("direct agenda attendance", () => {
  it("reserves a concrete accepted time without prior offer or owner approval, then confirms location", async () => {
    const f = fixture();
    const result = await f.turn();
    expect(f.rpc).toHaveBeenCalledWith("reserve_customer_appointment", expect.objectContaining({ p_start: start, p_lead: "lead", p_resource: "resource" }));
    expect(result).toMatchObject({ booked: true, bookingId: "booking" });
    expect(result?.reply).toContain("13:00"); expect(result?.reply).toContain("Rua de teste, 123"); expect(result?.reply).toContain("maps.google.com");
    expect(result?.reply).toContain("mudança");
  });
  it("keeps an accepted time through the name answer without asking for acceptance again", async () => {
    const f = fixture();
    expect(await f.turn({ leadName: null })).toMatchObject({ booked: false, reply: expect.stringContaining("como posso te chamar") });
    expect(f.rpc).not.toHaveBeenCalled();
    f.decide({ intent: "none" });
    expect(await f.turn({ runId: "next", userText: "Sou Magno" })).toMatchObject({ booked: true });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not reserve from an availability question even if the interpreter says book", async () => {
    const f = fixture(); await f.turn({ userText: "Tem horário amanhã às 13?" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("leaves checkout confirmation and delivery questions to the sales flow", async () => {
    const f = fixture({ empty: true });
    for (const userText of ["confirmar pedido", "qual o horário da entrega?", "quero pagar com cartão"]) {
      expect(await f.turn({ userText, catalogAppointment: false })).toMatchObject({ booked: false });
      expect((await f.turn({ userText, catalogAppointment: false }))?.handoffReason).toBeUndefined();
    }
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("offers alternatives for an occupied or blocked time", async () => {
    const f = fixture(); f.tables.customer_agenda_blocks.push({ organization_id: "org", resource_id: "resource", starts_at: start, ends_at: "2030-09-16T17:00:00Z" });
    const result = await f.turn();
    expect(f.rpc).not.toHaveBeenCalled(); expect(result?.reply).toContain("não está disponível"); expect(result?.reply).toContain("14:00");
  });
  it("handles missing calendars and ambiguous items without a reservation", async () => {
    const f = fixture({ empty: true });
    expect(await f.turn()).toMatchObject({ booked: false, handoffReason: expect.any(String) }); expect(f.fetch).not.toHaveBeenCalled();
    const ready = fixture(); expect(await ready.turn({ catalogAmbiguous: true })).toMatchObject({ booked: false, reply: expect.stringContaining("Qual dos") }); expect(ready.rpc).not.toHaveBeenCalled();
  });
  it("retains the same booking when the run or acceptance is repeated", async () => {
    const f = fixture(); await f.turn(); await f.turn(); await f.turn({ runId: "repeat" });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails factually on truncated interpretation or rejected write", async () => {
    const truncated = fixture({ finish: "MAX_TOKENS" }); expect(await truncated.turn()).toMatchObject({ booked: false, handoffReason: expect.stringContaining("incompleta") }); expect(truncated.rpc).not.toHaveBeenCalled();
    const failed = fixture({ fail: "database_unavailable" }); expect(await failed.turn()).toMatchObject({ booked: false, handoffReason: expect.any(String) });
  });
  it("prevents false confirmation and vague promises from overriding a factual result", () => {
    const runtime = runtimeHarness();
    const result = { booked: false, fallback: "Ainda não reservado", reply: "Escolha outra data" };
    for (const text of ["Agendei", "Vou confirmar a agenda e te dou retorno", "Já deixei anotado"]) expect(runtime("enforceAgendaResponse", text, "Marcar visita", result)).toBe("Escolha outra data");
  });
  it("uses the company timezone instead of the device timezone", () => {
    expect(agendaLocalInstant("2030-09-16T13:00", "America/Sao_Paulo")).toBe(start);
    expect(agendaLocalInstant("2030-09-16T13:00", "America/Manaus")).toBe("2030-09-16T17:00:00.000Z");
  });
});
