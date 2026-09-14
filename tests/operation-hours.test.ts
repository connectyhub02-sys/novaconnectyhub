import { describe, expect, it } from "vitest";
import { defaultOperationHours, evaluateOrderOperation, readOperationHours, validateOperationHours } from "@/lib/sales-catalog/operation-hours";

function policy() {
  const data = defaultOperationHours();
  data.enabled = true;
  data.schedules.orders.windows = [{ day: 0, start: "18:00", end: "02:00" }];
  return data;
}
describe("operation windows are distinct from shipping and appointments", () => {
  it("does not fabricate hours or estimates for an unconfigured operation", () => {
    expect(evaluateOrderOperation(undefined, "delivery")).toEqual({ allowed: true, state: "unconfigured", message: null, estimate: null });
  });
  it.each([
    ["2026-09-13T20:59:59Z", false], ["2026-09-13T21:00:00Z", true],
    ["2026-09-14T04:59:59Z", true], ["2026-09-14T05:00:00Z", false],
  ])("uses the configured timezone and includes only the open side of a midnight boundary: %s", (at, allowed) => {
    expect(evaluateOrderOperation(policy(), "delivery", new Date(at)).allowed).toBe(allowed);
  });
  it("treats a closed date as overriding a previous day's overnight window", () => {
    const data = policy(); data.closedDates = ["2026-09-14"];
    expect(evaluateOrderOperation(data, "delivery", new Date("2026-09-14T03:30:00Z")).allowed).toBe(false);
    data.closedDates = ["2026-09-13"];
    expect(evaluateOrderOperation(data, "delivery", new Date("2026-09-14T03:30:00Z")).allowed).toBe(false);
  });
  it("checks delivery and pickup independently", () => {
    const data = policy();
    data.schedules.delivery = { enabled: true, windows: [{ day: 0, start: "19:00", end: "23:00" }] };
    data.schedules.pickup = { enabled: true, windows: [{ day: 0, start: "18:00", end: "23:00" }] };
    expect(evaluateOrderOperation(data, "delivery", new Date("2026-09-13T21:30:00Z")).allowed).toBe(false);
    expect(evaluateOrderOperation(data, "pickup", new Date("2026-09-13T21:30:00Z")).allowed).toBe(true);
  });
  it("does not require a kitchen window for a digital product", () => {
    const data = policy(); data.schedules.preparation = { enabled: true, windows: [{ day: 1, start: "10:00", end: "12:00" }] };
    expect(evaluateOrderOperation(data, "none", new Date("2026-09-13T22:00:00Z")).allowed).toBe(true);
  });
  it("pauses until the configured instant and resumes at the boundary", () => {
    const data = policy(); data.pausedUntil = "2026-09-13T22:00:00Z";
    expect(evaluateOrderOperation(data, "pickup", new Date("2026-09-13T21:59:59Z")).allowed).toBe(false);
    expect(evaluateOrderOperation(data, "pickup", new Date(data.pausedUntil)).allowed).toBe(true);
  });
  it("rejects an estimate that would cross a closed preparation interval", () => {
    const data = policy(); data.preparationMinutes = { min: 10, max: 30 };
    data.schedules.preparation = { enabled: true, windows: [{ day: 0, start: "18:00", end: "18:20" }, { day: 0, start: "18:25", end: "23:00" }] };
    expect(evaluateOrderOperation(data, "delivery", new Date("2026-09-13T21:00:00Z"))).toMatchObject({ allowed: false, estimate: null });
  });
  it("checks the pickup window when preparation finishes", () => {
    const data = policy(); data.preparationMinutes = { min: 20, max: 30 };
    data.schedules.pickup = { enabled: true, windows: [{ day: 0, start: "18:00", end: "18:25" }] };
    expect(evaluateOrderOperation(data, "pickup", new Date("2026-09-13T21:00:00Z")).allowed).toBe(false);
  });
  it("reports only optional estimates explicitly configured by the business", () => {
    const data = policy(); data.preparationMinutes = { min: 20, max: 30 }; data.deliveryMinutes = { min: 10, max: 20 };
    expect(evaluateOrderOperation(data, "delivery", new Date("2026-09-13T21:00:00Z")).estimate).toBe("Preparo estimado: 20–30 min. Entrega estimada após o preparo: 10–20 min.");
    expect(evaluateOrderOperation(data, "none", new Date("2026-09-13T21:00:00Z")).estimate).toBeNull();
  });
  it("uses elapsed time through a DST clock repetition", () => {
    const data = policy(); data.timeZone = "America/New_York"; data.schedules.orders.windows = [{ day: 0, start: "00:00", end: "03:00" }];
    data.preparationMinutes = { min: 60, max: 90 };
    expect(evaluateOrderOperation(data, "pickup", new Date("2026-11-01T05:00:00Z")).allowed).toBe(true);
  });
  it.each(["bad-zone", ""])("fails closed for a malformed timezone: %s", timeZone => {
    expect(evaluateOrderOperation({ ...policy(), timeZone }, "delivery").state).toBe("invalid");
  });
  it("does not normalize malformed enabled schedules into unrestricted ones", () => {
    const data = readOperationHours({ ...policy(), schedules: { orders: { enabled: true, windows: [{ day: 9, start: "25:00", end: "26:00" }] } } });
    expect(validateOperationHours(data)).toBeTruthy();
    expect(evaluateOrderOperation(data, "delivery").allowed).toBe(false);
  });
});
