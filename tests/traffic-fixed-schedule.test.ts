import { describe, expect, it } from "vitest";
import { fixedPlanSlots, nextFixedRoutineDay, normalizeDailyTimes } from "../src/lib/whatsapp/fixed-schedule";

describe("fixed daily publication times in Brasilia", () => {
  it("accepts minutes, sorts times and preserves the automatic mode", () => {
    expect(normalizeDailyTimes(["18:00", "09:15", "14:00"])).toEqual(["09:15", "14:00", "18:00"]);
    expect(normalizeDailyTimes(null)).toBeNull();
    for (const value of [[], ["9:00"], ["24:00"], ["12:60"], ["09:00", "09:00"], [null], "09:00", ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00"]]) {
      expect(() => normalizeDailyTimes(value)).toThrow();
    }
  });
  it("keeps only future slots on activation and plans all slots on the next day", () => {
    const times = ["09:00", "14:00", "18:00"];
    const first = nextFixedRoutineDay(new Date("2026-10-15T15:00:00Z"), "2026-10-15T03:00:00Z", null, times);
    expect(first.slots).toEqual(["2026-10-15T17:00:00.000Z", "2026-10-15T21:00:00.000Z"]);
    expect(first.plannedUntil).toBe("2026-10-16T03:00:00.000Z");
    expect(nextFixedRoutineDay(new Date("2026-10-15T16:00:00Z"), "2026-10-15T03:00:00Z", first.plannedUntil, times).slots)
      .toEqual(["2026-10-16T12:00:00.000Z", "2026-10-16T17:00:00.000Z", "2026-10-16T21:00:00.000Z"]);
  });
  it("respects future start dates, local midnight, minutes and missed whole days", () => {
    expect(nextFixedRoutineDay(new Date("2026-10-15T23:00:00Z"), "2026-10-15T03:00:00Z", null, ["09:00"]).slots).toEqual(["2026-10-16T12:00:00.000Z"]);
    expect(nextFixedRoutineDay(new Date("2026-10-15T02:00:00Z"), "2026-10-14T03:00:00Z", null, ["23:30"]).slots).toEqual(["2026-10-15T02:30:00.000Z"]);
    expect(nextFixedRoutineDay(new Date("2026-10-15T12:00:00Z"), "2026-10-20T03:00:00Z", null, ["00:00", "09:15"]).slots).toEqual(["2026-10-20T03:00:00.000Z", "2026-10-20T12:15:00.000Z"]);
  });
  it("finite plans skip past times without extending the chosen date range", () => {
    expect(fixedPlanSlots("2026-10-15T03:00:00Z", 2, ["09:00", "18:00"], new Date("2026-10-15T15:00:00Z")))
      .toEqual(["2026-10-15T21:00:00.000Z", "2026-10-16T12:00:00.000Z", "2026-10-16T21:00:00.000Z"]);
    expect(() => fixedPlanSlots("2026-10-15T03:00:00Z", 1, ["09:00"], new Date("2026-10-15T15:00:00Z"))).toThrow("já passaram");
  });
});
