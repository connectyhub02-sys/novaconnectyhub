import { describe, expect, it } from "vitest";
import { boundDeliveryCoordinates, deliveryMoneyCents, deliveryZoneContainsPoint, quoteLocalDelivery } from "@/lib/sales-catalog/local-delivery";
import type { SalesCatalogLocalDeliveryZone } from "@/lib/sales-catalog/shared";

const zone = (patch: Partial<SalesCatalogLocalDeliveryZone> = {}): SalesCatalogLocalDeliveryZone => ({
  id: "center", name: "Centro", active: true, shape: "neighborhoods", neighborhoods: ["Centro"], cities: ["Florianópolis"],
  price: "12,50", minDays: 0, maxDays: 1, orderMinimum: "30,00", freeDeliveryThreshold: "100,00", priority: 0,
  baseAddress: null, baseLatitude: null, baseLongitude: null, radiusKm: null, polygon: [], notes: null, ...patch,
});
const quote = (subtotal = 60, address = "Rua das Flores, 42, Centro, Florianópolis", zones = [zone()]) => quoteLocalDelivery({ zones, subtotal, address });

describe("shared regional delivery authority", () => {
  it.each([29.99, 30, 99.99, 100])("applies minimum and free threshold to cart cents: %s", subtotal => {
    expect(quote(subtotal)).toMatchObject(subtotal < 30 ? { reason: "below_minimum", amount: null } : { reason: "available", amount: subtotal >= 100 ? 0 : 12.5 });
  });
  it.each(["Centro, Outra cidade", "Centro Novo, Outra cidade", "Florianópolis", "Centronorte, Florianópolis", "Zona Centro, Outra cidade"])("requires whole neighborhood and configured city: %s", address => {
    expect(quote(60, address).reason).toBe("outside_area");
  });
  it("does not use the zone title as geographical evidence", () => {
    expect(quote(60, "Entrega VIP, Florianópolis", [zone({ name: "Entrega VIP" })]).reason).toBe("outside_area");
  });
  it("uses explicit priority and rejects an unresolved overlap", () => {
    expect(quote(60, undefined, [zone(), zone({ id: "other", price: "1" })]).reason).toBe("overlap");
    expect(quote(60, undefined, [zone({ priority: 3 }), zone({ id: "other", price: "1", priority: 2 })]).amount).toBe(12.5);
  });
  it("ignores disabled zones", () => expect(quote(60, undefined, [zone({ active: false })]).amount).toBeNull());
  it.each(["88010000", "88010999"])("includes both CEP range boundaries: %s", cep => {
    expect(quoteLocalDelivery({ zones: [zone({ shape: "cep", cepStart: "88010000", cepEnd: "88010999" })], subtotal: 60, cep }).amount).toBe(12.5);
  });
  it("does not let an address bypass a received location outside a configured area", () => {
    const zones = [zone(), zone({ shape: "radius", baseLatitude: 0, baseLongitude: 0, radiusKm: 1 })];
    expect(quoteLocalDelivery({ zones, subtotal: 60, address: "Centro, Florianópolis", coordinates: { lat: 1, lng: 1 } })).toMatchObject({ source: "coordinates", reason: "outside_area" });
    expect(quoteLocalDelivery({ zones, subtotal: 60, address: "Centro, Florianópolis", authority: "address", coordinates: { lat: 1, lng: 1 } }).amount).toBe(12.5);
  });
  it("requires location when the configured authority is geometrical", () => {
    expect(quoteLocalDelivery({ zones: [zone()], authority: "coordinates", subtotal: 60, address: "Centro, Florianópolis" }).reason).toBe("missing_location");
  });
  it("includes polygon edges and vertices, excludes outside points", () => {
    const polygon = zone({ shape: "polygon", polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }] });
    for (const point of [{ lat: 0, lng: 0 }, { lat: 0.5, lng: 0 }, { lat: 0.5, lng: 0.5 }]) expect(deliveryZoneContainsPoint(polygon, point)).toBe(true);
    expect(deliveryZoneContainsPoint(polygon, { lat: 1.00001, lng: 0.5 })).toBe(false);
  });
  it("checks the exact radius boundary without expanding the delivery area", () => {
    const circle = zone({ shape: "radius", baseLatitude: 0, baseLongitude: 0, radiusKm: 1 });
    expect(deliveryZoneContainsPoint(circle, { lat: 180 / Math.PI / 6371, lng: 0 })).toBe(true);
    expect(deliveryZoneContainsPoint(circle, { lat: 1.001 * 180 / Math.PI / 6371, lng: 0 })).toBe(false);
  });
  it("invalidates a stored point when address or CEP changes", () => {
    const saved = { destination_address: "Rua das Flores, 42", cep: "88010-000", coordinates: { lat: -27, lng: -48 } };
    expect(boundDeliveryCoordinates(saved, "Rua das Flores, 42", "88010000")).toEqual(saved.coordinates);
    expect(boundDeliveryCoordinates(saved, "Rua das Flores, 43", "88010000")).toBeNull();
    expect(boundDeliveryCoordinates(saved, "Rua das Flores, 42", "88020000")).toBeNull();
    expect(boundDeliveryCoordinates({ coordinates: saved.coordinates }, "Rua das Flores, 42", "88010000")).toBeNull();
  });
  it.each(["-10", "12.345", "de 10 a 20", "grátis", "1e3"])("rejects an invalid fee: %s", price => {
    expect(deliveryMoneyCents(price)).toBeNull();
    expect(quote(60, undefined, [zone({ price })]).reason).toBe("invalid_price");
  });
});
