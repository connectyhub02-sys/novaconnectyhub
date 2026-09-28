import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { copyDayToWeek, OperationHoursEditor, withHoursEnabled, withMainWeek } from "@/components/connectyhub-os/operation-hours-editor";
import { defaultOperationHours, validateOperationHours, type SalesCatalogOperationHours } from "@/lib/sales-catalog/operation-hours";

const lanes = ["orders", "preparation", "delivery", "pickup"] as const;
const evening = (day: number, end = "23:30") => ({ day, start: "18:00", end });
const policyWith = (main: ReturnType<typeof evening>[], pickup = main): SalesCatalogOperationHours => ({
  ...defaultOperationHours(), enabled: true,
  schedules: { orders: { enabled: true, windows: main }, preparation: { enabled: true, windows: main }, delivery: { enabled: true, windows: main }, pickup: { enabled: true, windows: pickup } },
});
const html = (value: SalesCatalogOperationHours) => renderToStaticMarkup(<OperationHoursEditor value={value} onChange={() => undefined} />);

describe("business hours editor", () => {
  it("turning it on starts a valid evening week shared by orders, preparation, delivery and pickup", () => {
    const enabled = withHoursEnabled(defaultOperationHours(), true);
    expect(enabled.enabled).toBe(true);
    for (const lane of lanes) expect(enabled.schedules[lane].windows).toHaveLength(7);
    expect(validateOperationHours(enabled)).toBeNull();
  });

  it("editing the week updates every lane together, unless delivery and pickup were set apart", () => {
    const base = policyWith([evening(1)]);
    const copied = withMainWeek(base, copyDayToWeek(base.schedules.orders.windows, 1), false);
    for (const lane of lanes) expect(copied.schedules[lane].windows).toHaveLength(7);
    const apart = withMainWeek(policyWith([evening(1)], [evening(1, "22:00")]), [evening(2)], true);
    expect(apart.schedules.orders.windows).toEqual([evening(2)]);
    expect(apart.schedules.pickup.windows).toEqual([evening(1, "22:00")]);
  });

  it("shows a simple week without the old jargon", () => {
    const markup = html(policyWith([evening(1), evening(5)]));
    expect(markup).toContain("Controlar horário de funcionamento");
    expect(markup).toContain("Segunda");
    expect(markup).toContain("Tempo médio");
    expect(markup).toContain("Pausar pedidos por 1 hora");
    expect(markup).not.toContain("Conferir esta janela");
    expect(markup).not.toContain("Retirada no balcão");
  });

  it("opens the advanced part when the store already has different pickup hours", () => {
    expect(html(policyWith([evening(5)], [evening(5, "22:00")]))).toContain("Retirada no balcão");
  });
});
