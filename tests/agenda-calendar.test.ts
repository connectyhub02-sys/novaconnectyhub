import { describe, expect, it, vi } from "vitest";
import { calendarDate, calendarDays, calendarRange, minutesInDay, navigateCalendar, parseCalendarRange } from "../src/lib/automations/calendar-view";
import { commerceDatabase } from "./helpers/commerce-database";
vi.mock("server-only", () => ({}));
import { availableAppointments, getAgenda } from "../src/lib/automations/agenda";
import * as agenda from "../src/lib/automations/agenda";
import * as calendar from "../src/lib/automations/calendar-view";
import * as scope from "../src/lib/client-os/dashboard-route-scope";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as AgendaRoute from "../src/app/api/dashboard/agenda/route";

describe("calendar periods and company timezone", () => {
  it("navigates months without skipping February and includes the complete month grid", () => {
    expect(navigateCalendar("2028-01-31", "month", 1)).toBe("2028-02-01");
    const days = calendarDays("2028-02-29", "month");
    expect(days).toHaveLength(42);
    expect(days).toContain("2028-02-29");
    expect(parseCalendarRange(...Object.values(calendarRange(days)) as [string, string])).toEqual(calendarRange(days));
    expect(navigateCalendar("2026-12-31", "day", 1)).toBe("2027-01-01");
  });
  it("uses company dates and minutes across UTC midnight", () => {
    expect(calendarDate("2026-09-12T02:30:00Z", "America/Manaus")).toBe("2026-09-11");
    expect(minutesInDay("2026-09-12T02:30:00Z", "America/Manaus")).toBe(22 * 60 + 30);
    expect(minutesInDay("2026-09-12T04:00:00Z", "America/Manaus")).toBe(0);
  });
  it("rejects incomplete, reversed and unbounded periods", () => {
    expect(parseCalendarRange(null, null)).toBeUndefined();
    for (const [from, to] of [["invalid", "2026-09-12"], ["2026-09-12", null], ["2026-09-12", "2026-09-01"], ["2026-01-01", "2026-12-01"]]) expect(() => parseCalendarRange(from, to)).toThrow();
  });
  it("reads historical overlapping bookings only inside the company and requested interval", async () => {
    const db = commerceDatabase({ customer_agenda_bookings: [
      { id: "overlap", organization_id: "a", starts_at: "2020-01-31T23:00:00Z", ends_at: "2020-02-01T01:00:00Z" },
      { id: "other", organization_id: "b", starts_at: "2020-02-01T00:00:00Z", ends_at: "2020-02-01T01:00:00Z" },
      { id: "before", organization_id: "a", starts_at: "2020-01-31T22:00:00Z", ends_at: "2020-02-01T00:00:00.000Z" },
      { id: "after", organization_id: "a", starts_at: "2020-02-02T00:00:00.000Z", ends_at: "2020-02-02T01:00:00Z" },
    ] });
    const result = await getAgenda(db.client as never, "a", undefined, { from: "2020-02-01T00:00:00.000Z", to: "2020-02-02T00:00:00.000Z" });
    expect(result.bookings.map((booking) => booking.id)).toEqual(["overlap"]);
    expect(result.settings.enabled).toBe(false);
  });
  it("returns the entire selected local day's real availability without spilling into another day", async () => {
    const db = commerceDatabase({ customer_agenda_settings: [{ organization_id: "a", enabled: true, timezone: "America/Manaus" }], customer_agenda_resources: [{ id: "r", organization_id: "a", enabled: true, kind: "service", duration_minutes: 30, capacity: 1, blocked_dates: [], weekly_hours: [{ days: [1, 2, 3, 4, 5, 6, 7], start: "09:00", end: "18:00" }] }] });
    const day = calendarDate(new Date(Date.now() + 30 * 86400000), "America/Manaus");
    const slots = await availableAppointments(db.client as never, "a", "r", new Date(`${day}T04:00:00Z`), 1, undefined, day);
    expect(slots.length).toBeGreaterThan(12);
    expect(slots.every((slot) => calendarDate(slot.starts_at, "America/Manaus") === day)).toBe(true);
    expect(await availableAppointments(db.client as never, "a", "r", new Date(`${day}T04:00:00Z`))).toHaveLength(12);
    db.tables.customer_agenda_resources[0].blocked_dates = [day];
    expect(await availableAppointments(db.client as never, "a", "r", new Date(`${day}T04:00:00Z`), 1, undefined, day)).toEqual([]);
    db.tables.customer_agenda_settings[0].enabled = false;
    await expect(availableAppointments(db.client as never, "a", "r", new Date(`${day}T04:00:00Z`), 1, undefined, day)).rejects.toThrow("Agenda indisponível");
  });
  it("keeps session, company scope and write permissions on the calendar API", async () => {
    const db = commerceDatabase({ customer_agenda_bookings: [{ id: "history", organization_id: "a", starts_at: "2020-02-01T12:00:00Z", ends_at: "2020-02-01T13:00:00Z" }] });
    let workspace: unknown = { organization: { id: "a", role: "viewer" }, profile: { isPlatformAdmin: false } };
    const route = serverModuleHarness<typeof AgendaRoute>("src/app/api/dashboard/agenda/route.ts", {
      "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
      "@/lib/supabase/profile": { getCurrentWorkspace: async () => workspace },
      "@/lib/supabase/service": { createServiceClient: () => db.client },
      "@/lib/client-os/dashboard-route-scope": scope,
      "@/lib/automations/agenda": agenda,
      "@/lib/automations/calendar-view": calendar,
    });
    const request = (companyId: string, period = "&from=2020-02-01&to=2020-02-02") => ({ nextUrl: new URL(`https://fixture.invalid/api/dashboard/agenda?companyId=${companyId}${period}`), json: async () => ({ companyId, action: "set_enabled", enabled: true }) }) as never;
    expect((await (await route.GET(request("a"))).json()).bookings.map((item: { id: string }) => item.id)).toEqual(["history"]);
    expect((await route.GET(request("b"))).status).toBe(403);
    expect((await route.GET(request("a", "&from=2020-01-01&to=2021-01-01"))).status).toBe(400);
    expect((await route.POST(request("a"))).status).toBe(403);
    workspace = null;
    expect((await route.GET(request("a"))).status).toBe(401);
    expect((await route.POST(request("a"))).status).toBe(401);
  });
});
