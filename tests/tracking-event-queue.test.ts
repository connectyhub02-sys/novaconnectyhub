import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizePaymentAuditPayload } from "../src/lib/security/payment-audit";
import { serverModuleHarness } from "./helpers/server-module-harness";
afterEach(() => vi.restoreAllMocks());
describe("durable browser event queue", () => {
  it("retains an unacknowledged event and never includes card inputs", async () => {
    const entries = new Map<string, string>();
    const localStorage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) };
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    const mod = serverModuleHarness<typeof import("../src/lib/tracking/event-queue")>("src/lib/tracking/event-queue.ts", { "@/lib/security/payment-audit": { sanitizePaymentAuditPayload } }, [], { localStorage, crypto: { randomUUID: () => "event-1" }, window: { addEventListener: vi.fn(), setInterval: vi.fn() }, navigator: { onLine: true }, document: { visibilityState: "visible" }, fetch });
    expect(await mod.enqueueTrackingEvent({ event_type: "checkout_started", metadata: { creditCard: { number: "4111111111111111", cvv: "123" } } })).toBeNull();
    const stored = [...entries.values()][0];
    expect(stored).toContain("event-1"); expect(stored).not.toContain("4111111111111111");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("preserves IDs and masks raw card details in free text", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(sanitizePaymentAuditPayload({ id, path: `/checkout/${id}`, text: "Meu cartão 4111 1111 1111 1111 CVV: 123" })).toEqual({ id, path: `/checkout/${id}`, text: "Meu cartão [dados de cartão removidos] CVV: [removido]" });
  });
});
