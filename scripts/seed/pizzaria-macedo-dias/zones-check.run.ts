// Checks the saved delivery zones of the test store against sample addresses and location pins.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

for (const line of readFileSync(resolve(__dirname, "../../../.env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
vi.mock("server-only", () => ({}));

it.runIf(process.env.SEED_STEP === "zones")("delivery fee by written neighborhood and by location pin", async () => {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { quoteLocalDelivery } = await import("@/lib/sales-catalog/local-delivery");
  const { data } = await createServiceClient().from("intelligence_memory").select("metadata")
    .eq("organization_id", "a90c4ce6-b66c-47c4-a3f3-660af7bb178d").eq("memory_type", "sales_catalog_shipping_settings").single();
  const zones = ((data?.metadata as { local_delivery_zones?: Array<Record<string, unknown>> }).local_delivery_zones ?? []).map(zone => ({
    id: zone.id, name: zone.name, active: zone.active, shape: zone.shape, priority: zone.priority, baseAddress: zone.base_address,
    baseLatitude: zone.base_latitude, baseLongitude: zone.base_longitude, radiusKm: zone.radius_km, polygon: zone.polygon ?? [],
    neighborhoods: zone.neighborhoods ?? [], cities: zone.cities ?? [], price: zone.price, minDays: zone.min_days, maxDays: zone.max_days,
    freeDeliveryThreshold: zone.free_delivery_threshold, orderMinimum: zone.order_minimum, notes: zone.notes,
  })) as never;
  const byAddress = (address: string, subtotal = 70) => { const quote = quoteLocalDelivery({ zones, subtotal, address }); return [quote.reason === "available" ? quote.zone?.name : quote.reason, quote.amount]; };
  const byPin = (lat: number, lng: number) => { const quote = quoteLocalDelivery({ zones, subtotal: 70, coordinates: { lat, lng } }); return [quote.reason === "available" ? quote.zone?.name : quote.reason, quote.amount]; };

  expect(byAddress("Rua 2000, 150, Centro, Balneário Camboriú")).toEqual(["Balneário Camboriú — Centro e orla", 5]);
  expect(byAddress("Rua 2000, 150, Centro, Balneário Camboriú", 130)).toEqual(["Balneário Camboriú — Centro e orla", 0]);
  expect(byAddress("Rua Angelina, 80, Nova Esperança, Balneário Camboriú")).toEqual(["Balneário Camboriú — demais bairros", 8]);
  expect(byAddress("Rua São Pedro, 50, Tabuleiro, Camboriú")).toEqual(["Camboriú", 10]);
  expect(byAddress("Av. José Medeiros Vieira, 900, Praia Brava, Itajaí")).toEqual(["Itajaí (sul)", 12]);
  expect(byAddress("Rua 1, Centro, Florianópolis")[0]).toBe("outside_area");
  expect(byAddress("Rua 2000, Centro, Balneário Camboriú", 30)[0]).toBe("below_minimum");
  expect(byPin(-26.9950, -48.6350)).toEqual(["Até 4 km da pizzaria", 5]); // Av. Brasil, Centro
  expect(byPin(-27.0270, -48.6520)).toEqual(["De 4 a 8 km", 8]); // Barra Sul / Estaleiro side
  expect(byPin(-26.9080, -48.6620)).toEqual(["De 8 a 15 km", 12]); // Itajaí centro
  expect(byPin(-27.5950, -48.5480)[0]).toBe("outside_area"); // Florianópolis
});
