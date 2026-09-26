import { describe, expect, it } from "vitest";
import { detectRequestedReturn, parseBirthday, resolveProductReturnRule } from "@/lib/automations/return-rules";

const now = new Date("2026-09-26T12:00:00Z");
const daysFrom = (date: Date | undefined) => date ? Math.round((date.getTime() - now.getTime()) / 86400000) : null;

describe("product return rule", () => {
  it("uses the product's own days, where 0 turns it off", () => {
    expect(resolveProductReturnRule({ return_after_days: 25, return_repeat: true })).toEqual({ days: 25, repeat: true });
    expect(resolveProductReturnRule({ return_after_days: 0 }, "pizzaria_delivery")).toBeNull();
  });

  it("falls back to the product's activity, then to the store's activity", () => {
    expect(resolveProductReturnRule({ activity_profile: { templateId: "dentista" } }, "pizzaria_delivery")).toEqual({ days: 180, repeat: false });
    expect(resolveProductReturnRule({}, "pizzaria_delivery")).toEqual({ days: 7, repeat: true });
    expect(resolveProductReturnRule({}, "advogado")).toBeNull();
    expect(resolveProductReturnRule({}, "barbearia_salao")).toEqual({ days: 25, repeat: true });
  });
});

describe("lead asking to be contacted later", () => {
  it.each([
    ["me chama mês que vem", 30],
    ["Me liga daqui a 15 dias por favor", 15],
    ["fala comigo semana que vem", 7],
    ["me lembra amanhã", 1],
    ["me chama daqui duas semanas", 14],
    ["entra em contato em 3 meses", 90],
  ])("%s", (text, days) => {
    expect(daysFrom(detectRequestedReturn(text, now)?.returnAt)).toBe(days);
  });

  it.each(["vou pensar e te aviso", "mês que vem eu vejo", "me chama", "obrigado, me chama quando tiver promoção"])("does not schedule: %s", text => {
    expect(detectRequestedReturn(text, now)).toBeNull();
  });
});

describe("birthday answer", () => {
  it.each([
    ["15/03", { day: 15, month: 3 }],
    ["é dia 7 de setembro", { day: 7, month: 9 }],
    ["29/02/1990", { day: 29, month: 2 }],
    ["01-12", { day: 1, month: 12 }],
  ])("%s", (text, expected) => {
    expect(parseBirthday(text)).toEqual(expected);
  });

  it.each(["31/02", "prefiro não dizer", "15/13"])("rejects %s", text => {
    expect(parseBirthday(text)).toBeNull();
  });
});
