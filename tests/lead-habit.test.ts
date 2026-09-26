import { describe, expect, it } from "vitest";
import * as contactWindow from "../src/lib/automations/contact-window";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

const habit = serverModuleHarness<typeof import("../src/lib/automations/lead-habit")>("src/lib/automations/lead-habit.ts", {
  "./contact-window": contactWindow,
});
const saoPaulo = { start: "09:00", end: "20:00", timezone: "America/Sao_Paulo" };
const at = (iso: string) => new Date(iso);

describe("lead's usual hour", () => {
  it("learns the hour from the lead's messages and from when the lead read our messages", async () => {
    const day = (n: number, hour: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 11) + `${String(hour).padStart(2, "0")}:10:00.000Z`;
    const db = commerceDatabase({
      conversation_messages: [{ organization_id: "org", lead_id: "lead", direction: "inbound", occurred_at: day(1, 23) }],
      whatsapp_webhook_events: [2, 3, 4].map(n => ({ whatsapp_instance_id: "instance", event_type: "ReadReceipt", received_at: day(n, 23),
        payload: { event: { chatid: "5547999999999@s.whatsapp.net" } } })),
    });
    // 23:10 UTC is 20:10 in São Paulo, on four different days.
    expect(await habit.loadLeadActiveHour(db.client as never, { organizationId: "org", leadId: "lead", whatsappInstanceId: "instance",
      phone: "5547999999999", timezone: "America/Sao_Paulo" })).toBe(20);
    expect(await habit.loadLeadActiveHour(db.client as never, { organizationId: "org", leadId: "lead", whatsappInstanceId: "instance",
      phone: null, timezone: "America/Sao_Paulo" })).toBeNull();
  });

  it("waits for the usual hour inside the company window", () => {
    // 10:00 in São Paulo; the lead is usually around at 15:00.
    expect(habit.leadHabitSendTime(at("2026-09-25T13:00:00Z"), 15, saoPaulo)?.toISOString()).toBe("2026-09-25T18:00:00.000Z");
  });

  it("uses the closest edge of the company window when the lead's hour is outside it", () => {
    // Usually at 22:00: the message goes at 19:15, before the company stops at 20:00.
    expect(habit.leadHabitSendTime(at("2026-09-25T13:00:00Z"), 22, saoPaulo)?.toISOString()).toBe("2026-09-25T22:15:00.000Z");
    // Usually at 06:00, asked at 16:00: next morning at 09:00.
    expect(habit.leadHabitSendTime(at("2026-09-25T19:00:00Z"), 6, saoPaulo)?.toISOString()).toBe("2026-09-26T12:00:00.000Z");
  });

  it("sends now when it is already about the usual hour or the wait would be too long", () => {
    expect(habit.leadHabitSendTime(at("2026-09-25T13:00:00Z"), 11, saoPaulo)).toBeNull();
    // 10:00, usual hour 09:00 is 23 hours away.
    expect(habit.leadHabitSendTime(at("2026-09-25T13:00:00Z"), 8, saoPaulo)).toBeNull();
  });
});
