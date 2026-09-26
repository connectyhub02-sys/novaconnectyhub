import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as shared from "../src/lib/sales-catalog/shared";

type Bulk = typeof import("../src/lib/sales-catalog/bulk-destination");

const product = (id: string, destination: string, extra: Record<string, unknown> = {}) => ({
  id, scope: "organization", organization_id: "org", memory_type: "sales_catalog_item",
  content: `Produto/oferta: ${id}\nDestino da venda: checkout ConnectyHub\nDescricao: x`, metadata: { sales_destination: destination, ...extra },
});

function setup(agenda = true) {
  const db = commerceDatabase({ intelligence_memory: [
    product("corte", "connectyhub_checkout"), product("barba", "appointment"),
    product("kit", "external_site"), product("combo", "connectyhub_checkout", { food_composition: { enabled: true } }),
  ] });
  const bulk = serverModuleHarness<Bulk>("src/lib/sales-catalog/bulk-destination.ts", {
    "@/lib/automations/agenda-activation": { readAgendaActivation: async () => ({ enabled: agenda }) },
    "@/lib/sales-catalog/shared": shared,
  });
  return { db, apply: (destination: "appointment" | "connectyhub_checkout") => bulk.applyDestinationToAllProducts(db.client as never, { organizationId: "org", destination, userId: "u" }) };
}

describe("apply the activity action to every product", () => {
  it("moves products to the new action and keeps external links and food assemblies", async () => {
    const { db, apply } = setup();
    const result = await apply("appointment");
    expect(result).toEqual({ updatedIds: ["corte"], skipped: 2 });
    const corte = db.tables.intelligence_memory.find(row => row.id === "corte")!;
    expect(corte.metadata).toMatchObject({ sales_destination: "appointment" });
    expect(corte.content).toContain("Destino da venda: agendamento");
  });

  it("refuses scheduling while the company calendar is off", async () => {
    await expect(setup(false).apply("appointment")).rejects.toThrow("Ative a agenda");
  });
});
