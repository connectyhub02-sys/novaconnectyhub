import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Scheduling = typeof import("../src/lib/sales-catalog/paid-scheduling");

function setup(options: { enabled?: boolean; resource?: string | null; slots?: string[] }) {
  const db = commerceDatabase({ intelligence_memory: [{ id: "cleaning", organization_id: "org", metadata: { fulfillment: { agenda_resource_id: "chair" } } }] });
  const module = serverModuleHarness<Scheduling>("src/lib/sales-catalog/paid-scheduling.ts", {
    "@/lib/automations/agenda-activation": {
      readAgendaActivation: async () => ({ enabled: options.enabled !== false, defaultResourceId: null, timezone: "America/Sao_Paulo" }),
      resolveCompanyAgendaResourceId: async (_c: unknown, _o: string, item: string | null) => options.resource === undefined ? item : options.resource,
    },
    "@/lib/automations/agenda": { availableAppointments: async () => (options.slots ?? []).map(starts_at => ({ starts_at, ends_at: starts_at })) },
  });
  const plan = (items: Record<string, unknown>[]) => module.planPaidScheduling(db.client as never, { organizationId: "org", conversationId: "c", leadId: "lead", items });
  return { plan };
}
const paid = [{ catalog_item_id: "cleaning", title: "Limpeza dental", fulfillment: { scheduling_required: true } }];

describe("pay first, schedule after", () => {
  it("offers real calendar times for the paid service and keeps them for the agenda flow", async () => {
    const result = await setup({ slots: ["2026-09-29T13:00:00Z", "2026-09-29T14:00:00Z", "2026-09-30T13:00:00Z"] }).plan(paid);
    expect(result?.kind).toBe("offer");
    expect(result?.text).toContain("Limpeza dental");
    expect(result?.text).toContain("Qual fica melhor");
    expect(result && "offer" in result ? result.offer : null).toMatchObject({ conversation_id: "c", resource_id: "chair", catalog_item_id: "cleaning", accepted: false });
  });

  it.each([
    ["the calendar is off", { enabled: false }],
    ["there is no calendar for the service", { resource: null }],
    ["there are no free times", { slots: [] }],
  ])("never promises a date when %s", async (_label, options) => {
    const result = await setup(options).plan(paid);
    expect(result).toMatchObject({ kind: "later", productTitle: "Limpeza dental" });
    expect(result?.text).toContain("já te chamo");
  });

  it("does nothing for products that do not need a time", async () => {
    expect(await setup({ slots: ["2026-09-29T13:00:00Z"] }).plan([{ catalog_item_id: "x", title: "Escova", fulfillment: {} }])).toBeNull();
  });
});
