import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Results = typeof import("../src/lib/automations/follow-up-results");
const results = serverModuleHarness<Results>("src/lib/automations/follow-up-results.ts");
const t = (hours: number) => new Date(Date.UTC(2026, 8, 20) + hours * 3600_000).toISOString();

describe("follow-up results", () => {
  const dispatches = [
    { lead_id: "a", journey: "recovery", status: "sent", sent_at: t(0), event_data: { salesCatalogOrderId: "order-a" } },
    { lead_id: "b", journey: "recommendation", status: "sent", sent_at: t(1), event_data: { browseProductId: "whey" } },
    { lead_id: "c", journey: "recommendation", status: "sent", sent_at: t(2), event_data: { reactivation: true } },
    { lead_id: "d", journey: "return", status: "sent", sent_at: t(3), event_data: { returnId: "v" } },
    { lead_id: "d", journey: "birthday", status: "sent", sent_at: t(30), event_data: { birthdayYear: 2026 } },
    { lead_id: "e", journey: "conversation", status: "skipped", sent_at: null, event_data: {} },
  ];
  const inbound = [
    { lead_id: "a", occurred_at: t(1) },
    { lead_id: "c", occurred_at: t(60) },
    { lead_id: "d", occurred_at: t(31) },
  ];
  const orders = [
    { id: "order-a", lead_id: "a", total: "100,00", paid_at: t(2) },
    { id: "order-b", lead_id: "b", total: 50, paid_at: t(24 * 9) },
    { id: "order-d", lead_id: "d", total: "80", paid_at: t(40) },
  ];

  it("counts messages, answers within 48 hours and sales credited to the last follow-up", () => {
    const summary = results.summarizeFollowUpResults(dispatches, inbound, orders);
    const byKind = Object.fromEntries(summary.rows.map(row => [row.kind, row]));
    expect(byKind.recovery).toMatchObject({ label: "Pagamento pendente", sent: 1, replied: 1, sales: 1, revenue: 100 });
    expect(byKind.browse).toMatchObject({ label: "Navegou e não comprou", sent: 1, replied: 0, sales: 0 });
    expect(byKind.reactivation).toMatchObject({ sent: 1, replied: 0 });
    expect(byKind.return).toMatchObject({ sent: 1, replied: 1, sales: 0 });
    expect(byKind.birthday).toMatchObject({ sent: 1, replied: 1, sales: 1, revenue: 80 });
    expect(byKind.conversation).toBeUndefined();
    expect(summary).toMatchObject({ sales: 2, revenue: 180 });
  });
});
