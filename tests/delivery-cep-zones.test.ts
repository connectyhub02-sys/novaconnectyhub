import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prefetchCepPlaces } from "@/lib/sales-catalog/cep-lookup";
import { completeAddressWithCepPlace, readCepPlace, rememberCepPlace } from "@/lib/sales-catalog/cep-place";
import { quoteLocalDelivery } from "@/lib/sales-catalog/local-delivery";
import type { SalesCatalogLocalDeliveryZone } from "@/lib/sales-catalog/shared";
import { scenario, type Row } from "./helpers/order-revision-scenario";

// Pizzaria Macedo&Dias zones (12/10): districts plus radius rings saved without their own base.
const zone = (patch: Partial<SalesCatalogLocalDeliveryZone>): SalesCatalogLocalDeliveryZone => ({
  id: "z", name: "Zona", active: true, shape: "neighborhoods", neighborhoods: [], cities: [], price: "5.00", minDays: 0, maxDays: 0,
  orderMinimum: "40.00", freeDeliveryThreshold: null, priority: 0, baseAddress: null, baseLatitude: null, baseLongitude: null,
  radiusKm: null, polygon: [], notes: null, ...patch,
});
const zones = [
  zone({ id: "bc-centro", name: "Balneário Camboriú — Centro e orla", neighborhoods: ["Centro", "Pioneiros", "Barra Sul"], cities: ["Balneário Camboriú"], freeDeliveryThreshold: "120.00" }),
  zone({ id: "camboriu", name: "Camboriú", neighborhoods: ["Tabuleiro", "Monte Alegre"], cities: ["Camboriú"], price: "10.00" }),
  zone({ id: "raio-4km", name: "Até 4 km da pizzaria", shape: "radius", radiusKm: 4, priority: 3 }),
];
const centro = { cep: "88330786", street: "Rua 1131", neighborhood: "Centro", city: "Balneário Camboriú", uf: "SC" };
const quote = (address: string, cep = "", subtotal = 92.9) => quoteLocalDelivery({ zones, subtotal, address, cep, authority: "auto" });

afterEach(() => { vi.unstubAllGlobals(); });

describe("delivery area by the CEP's district (Max, 12/10)", () => {
  it("finds the district and city of the CEP even when the customer typed neither", () => {
    rememberCepPlace("88330786", centro);
    expect(quote("rua 1131 numero 61, 88330786", "88330786")).toMatchObject({ reason: "available", zone: { id: "bc-centro" }, amount: 5 });
    expect(quote("rua 1131 numero 61 centro de balneario camboruiu", "88330786")).toMatchObject({ zone: { id: "bc-centro" } });
  });

  it("trusts the CEP over the typed district and never confuses Camboriú with Balneário Camboriú", () => {
    rememberCepPlace("88340000", { cep: "88340000", street: null, neighborhood: "Tabuleiro", city: "Camboriú", uf: "SC" });
    expect(quote("Rua X, 10, Centro, Balneário Camboriú", "88340000")).toMatchObject({ zone: { id: "camboriu" } });
    rememberCepPlace("88339999", { cep: "88339999", street: null, neighborhood: "Bairro Inexistente", city: "Balneário Camboriú", uf: "SC" });
    expect(quote("Rua X, 10", "88339999")).toMatchObject({ reason: "outside_area", error: expect.stringContaining("Bairro Inexistente, Balneário Camboriú") });
  });

  it("keeps the typed text when the CEP is unknown or has no district", () => {
    rememberCepPlace("88330000", { cep: "88330000", street: null, neighborhood: null, city: "Balneário Camboriú", uf: "SC" });
    expect(quote("Rua X, 10, Pioneiros, Balneário Camboriú", "88330000")).toMatchObject({ zone: { id: "bc-centro" } });
    expect(quote("Rua X, 10, Pioneiros", "11111111")).toMatchObject({ reason: "outside_area" });
  });

  it("completes the saved address with district and city from the CEP, once", () => {
    expect(completeAddressWithCepPlace("rua 1131 numero 61, 88330786", centro)).toBe("rua 1131 numero 61, 88330786, Centro, Balneário Camboriú - SC");
    expect(completeAddressWithCepPlace("Rua 1131, 61, centro, balneario camboriu", centro)).toBe("Rua 1131, 61, centro, balneario camboriu");
  });
});

describe("postal directory lookup", () => {
  it("uses ViaCEP, falls back to BrasilAPI and stores the answer for the checkout and the payment guard", async () => {
    const upserts: Row[] = [];
    const client = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }), upsert: (row: Row) => { upserts.push(row); return Promise.resolve({}); } }) };
    const fetcher = vi.fn(async (url: string) => url.includes("viacep")
      ? new Response(JSON.stringify({ erro: true }))
      : new Response(JSON.stringify({ cep: "88010000", city: "Florianópolis", neighborhood: "Centro", street: "Rua A", state: "SC" })));
    await prefetchCepPlaces(client as never, ["88010-000", "88010000", null, "123"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readCepPlace("88010000")).toMatchObject({ neighborhood: "Centro", city: "Florianópolis" });
    expect(upserts).toEqual([expect.objectContaining({ cep: "88010000", source: "brasilapi", neighborhood: "Centro" })]);
    await prefetchCepPlaces(client as never, ["88010000"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reads the shared database cache before the network and survives a directory outage", async () => {
    const client = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [{ cep: "88020000", street: null, neighborhood: "Trindade", city: "Florianópolis", uf: "SC" }] }) }) }) };
    const fetcher = vi.fn(async () => { throw new Error("offline"); });
    await prefetchCepPlaces(client as never, ["88020000", "88030000"], fetcher);
    expect(readCepPlace("88020000")).toMatchObject({ neighborhood: "Trindade" });
    expect(readCepPlace("88030000")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("WhatsApp agent delivery (Max, 05/10 and 12/10)", () => {
  function pizzaria() {
    const s = scenario();
    s.ctx.instance.metadata = { order_tools: true };
    s.ctx.salesCatalogOrders = [];
    s.db.tables.sales_catalog_orders = [];
    s.ctx.lead.metadata = { person_name: "Maria Oliveira", email: "cliente@example.com", cpf: "52998224725" };
    s.db.tables.leads[0].metadata = structuredClone(s.ctx.lead.metadata);
    s.ctx.messages = [];
    s.ctx.salesCatalogShippingSettings = { configured: true, shippingEnabled: false, localPickup: true, localDeliveryEnabled: true, localDeliveryAuthority: "auto",
      defaultHandlingDays: 0, rules: [], localDeliveryZones: zones } as never;
    let latest = s.message("inbound", "oi");
    const say = (text: string) => { latest = s.message("inbound", text); s.ctx.messages.push(latest); s.db.tables.conversation_messages = [...s.ctx.messages]; };
    const build = () => s.call<Promise<Row & { ok: boolean; motivo?: string; resumo?: string }>>("executeOrderTool", { client: s.db.client, context: s.ctx,
      scope: { kind: "cart" }, latestInbound: latest, token: "fake", phone: "5500000000000", deferred: [], name: "montar_pedido",
      args: { itens: [{ produto_id: "pizza", quantidade: 1 }], forma_pagamento: "pix" } });
    (s.ctx.salesCatalog[0] as Row).price = "92,90";
    return { ...s, say, build };
  }

  it("never reads a street and a house number as GPS coordinates", () => {
    const s = pizzaria();
    expect(s.call("extractRuntimeCoordinates", null, "rua 1131, 61, bairro centro, balneario camboriu, cep 88330786")).toBeNull();
    expect(s.call("extractRuntimeCoordinates", null, "rua 1131 numero 61, 88330786")).toBeNull();
    expect(s.call("extractRuntimeCoordinates", null, "estou em -26.99056, -48.63472")).toEqual({ lat: -26.99056, lng: -48.63472 });
  });

  it("delivers to the CEP's district from the first message, with district and city in the order address", async () => {
    rememberCepPlace("88330786", centro);
    const s = pizzaria();
    s.say("Magno macedo\n52998224725\nrua 1131 numero 61, 88330786, vou pagar no pix");
    const result = await s.build();
    expect(result).toMatchObject({ ok: true });
    expect(result.resumo).toContain("Centro, Balneário Camboriú - SC");
  });

  it("joins a district sent alone to the address of the previous message", async () => {
    rememberCepPlace("88330786", null, 60_000);
    const s = pizzaria();
    s.say("rua 1131, 61, 88330786");
    s.say("bairro centro de balneario camboriu");
    expect(s.call<string>("buildSalesCatalogShippingIntentText", s.ctx, "bairro centro de balneario camboriu")).toContain("rua 1131, 61");
    expect(await s.build()).toMatchObject({ ok: true });
  });

  it("explains an out-of-area address with one next step, never a reference point", async () => {
    rememberCepPlace("88339999", { cep: "88339999", street: null, neighborhood: "Bairro Inexistente", city: "Balneário Camboriú", uf: "SC" });
    const s = pizzaria();
    s.say("rua 9, 10, 88339999");
    const result = await s.build();
    expect(result.ok).toBe(false);
    expect(result.motivo).toContain("Bairro Inexistente");
    expect(result.motivo).toContain("Não peça ponto de referência");
  });
});

describe("radius zones saved without their own base", () => {
  it("are measured from the company's primary address when quoting, never rewritten in the panel data", async () => {
    const { getOrganizationSalesCatalogShippingSettings } = await import("@/lib/client-os/sales-catalog");
    const settingsRow = { id: "s", organization_id: "org", title: "frete", content: "", created_at: null, updated_at: null,
      metadata: { configured: true, local_delivery_enabled: true, local_delivery_zones: [{ id: "raio-4km", name: "Até 4 km", active: true, shape: "radius", radius_km: 4, price: "5.00" }] } };
    const chain = (result: unknown): Row => new Proxy({}, { get: (_target, key) => key === "then"
      ? (resolve: (value: unknown) => void) => resolve(result)
      : key === "maybeSingle" ? () => Promise.resolve(result) : () => chain(result) });
    const client = { from: (table: string) => chain(table === "organization_locations"
      ? { data: { address: "Avenida Brasil, 1500 - Centro", latitude: "-26.9905000", longitude: "-48.6337000" } }
      : { data: settingsRow, error: null }) };
    const settings = await getOrganizationSalesCatalogShippingSettings(client as never, "org");
    expect(settings?.localDeliveryZones[0]).toMatchObject({ baseLatitude: -26.9905, baseLongitude: -48.6337, baseAddress: "Avenida Brasil, 1500 - Centro" });
    const pin = { lat: -26.9950, lng: -48.6300 };
    expect(quoteLocalDelivery({ zones: settings!.localDeliveryZones, subtotal: 60, coordinates: pin })).toMatchObject({ reason: "available", zone: { id: "raio-4km" } });
  });
});

describe("address cleanup", () => {
  it("drops the whole payment phrase from the delivery address (Max, 12/10)", () => {
    const s = scenario();
    expect(s.call("extractRuntimeAddress", null, "rua 1131 numero 61, 88330786, vou pagar no pix")).toBe("rua 1131 numero 61, 88330786");
    expect(s.call("extractRuntimeAddress", null, "Rua das Flores, 42, Centro, pagamento no cartão de crédito")).toBe("Rua das Flores, 42, Centro");
  });
});
