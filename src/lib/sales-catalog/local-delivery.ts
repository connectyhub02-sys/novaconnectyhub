import type { SalesCatalogGeoPoint, SalesCatalogLocalDeliveryAuthority, SalesCatalogLocalDeliveryZone } from "./shared";

export function deliveryMoneyCents(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const text = String(value).trim().replace(/^R\$\s*/i, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const validDeliveryPoint = (point: SalesCatalogGeoPoint | null | undefined): point is SalesCatalogGeoPoint => Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);

/** A location is reusable only for the exact destination the customer confirmed. */
export function boundDeliveryCoordinates(quote: unknown, address: string | null | undefined, cep: string | null | undefined): SalesCatalogGeoPoint | null {
  if (!quote || typeof quote !== "object") return null;
  const saved = quote as Record<string, unknown>;
  if (typeof saved.destination_address !== "string" || !address?.trim() || normalized(saved.destination_address) !== normalized(address)) return null;
  if (String(saved.cep ?? "").replace(/\D/g, "") !== String(cep ?? "").replace(/\D/g, "")) return null;
  const point = saved.coordinates as SalesCatalogGeoPoint | null;
  return validDeliveryPoint(point) ? { lat: point.lat, lng: point.lng } : null;
}

export function deliveryZoneContainsPoint(zone: SalesCatalogLocalDeliveryZone, point: SalesCatalogGeoPoint) {
  if (!validDeliveryPoint(point)) return false;
  if (zone.shape === "radius") {
    const base = { lat: zone.baseLatitude!, lng: zone.baseLongitude! };
    if (zone.baseLatitude == null || zone.baseLongitude == null || !validDeliveryPoint(base) || !zone.radiusKm || zone.radiusKm <= 0) return false;
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const a = Math.sin(radians(point.lat-base.lat)/2)**2 + Math.cos(radians(base.lat))*Math.cos(radians(point.lat))*Math.sin(radians(point.lng-base.lng)/2)**2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,a))) <= zone.radiusKm + 1e-9;
  }
  if (zone.shape !== "polygon" || zone.polygon.length < 3 || !zone.polygon.every(validDeliveryPoint)) return false;
  let inside = false;
  for (let i=0,j=zone.polygon.length-1; i<zone.polygon.length; j=i++) {
    const a=zone.polygon[i], b=zone.polygon[j];
    const cross=(point.lng-a.lng)*(b.lat-a.lat)-(point.lat-a.lat)*(b.lng-a.lng);
    // Edges and vertices belong to the configured area; no commercial tolerance is guessed.
    if (Math.abs(cross)<1e-10 && point.lng>=Math.min(a.lng,b.lng) && point.lng<=Math.max(a.lng,b.lng) && point.lat>=Math.min(a.lat,b.lat) && point.lat<=Math.max(a.lat,b.lat)) return true;
    if ((a.lat>point.lat)!==(b.lat>point.lat) && point.lng<(b.lng-a.lng)*(point.lat-a.lat)/(b.lat-a.lat)+a.lng) inside=!inside;
  }
  return inside;
}

export type LocalDeliveryResult = {
  zone: SalesCatalogLocalDeliveryZone | null;
  amount: number | null;
  source: "coordinates" | "cep" | "address";
  reason: "available" | "missing_location" | "outside_area" | "overlap" | "below_minimum" | "invalid_price";
  error: string | null;
};
/** One authority and one selected zone for conversation, checkout and revisions. */
export function quoteLocalDelivery(input: {
  zones: SalesCatalogLocalDeliveryZone[]; subtotal: number; address?: string | null; cep?: string | null;
  coordinates?: SalesCatalogGeoPoint | null; authority?: SalesCatalogLocalDeliveryAuthority;
}): LocalDeliveryResult {
  const zones=input.zones.filter(zone=>zone.active), cep=input.cep?.replace(/\D/g, "") ?? "";
  const geometric=zones.some(zone=>zone.shape==="radius" || zone.shape==="polygon");
  const cepZones=zones.some(zone=>zone.shape==="cep");
  const authority=input.authority ?? "auto";
  const source=authority!=="auto" ? authority : validDeliveryPoint(input.coordinates) && geometric ? "coordinates"
    : /^\d{8}$/.test(cep) && cepZones ? "cep" : zones.some(zone=>zone.shape==="neighborhoods") ? "address" : geometric ? "coordinates" : "cep";
  const fail=(reason:LocalDeliveryResult["reason"],error:string,zone:SalesCatalogLocalDeliveryZone|null=null):LocalDeliveryResult=>({zone,amount:null,source,reason,error});
  if (source==="coordinates" && !validDeliveryPoint(input.coordinates)) return fail("missing_location","Envie a localização para conferir a área de entrega.");
  if (source==="cep" && !/^\d{8}$/.test(cep)) return fail("missing_location","Informe o CEP completo para conferir a área de entrega.");
  if (source==="address" && !input.address?.trim()) return fail("missing_location","Informe o bairro e a cidade para conferir a área de entrega.");
  const address=` ${normalized(input.address ?? "")} `;
  const includes=(part:string)=>Boolean(normalized(part)) && address.includes(` ${normalized(part)} `);
  const matches=zones.filter(zone=>{
    if(source==="coordinates") return deliveryZoneContainsPoint(zone,input.coordinates!);
    if(source==="cep") return zone.shape==="cep" && /^\d{8}$/.test(zone.cepStart ?? "") && /^\d{8}$/.test(zone.cepEnd ?? "") && cep>=zone.cepStart! && cep<=zone.cepEnd!;
    return zone.shape==="neighborhoods" && zone.neighborhoods.length>0 && zone.neighborhoods.some(includes) && (!zone.cities.length || zone.cities.some(includes));
  }).sort((a,b)=>(b.priority??0)-(a.priority??0));
  if(!matches.length) return fail("outside_area","Este endereço não está na área de entrega configurada.");
  if(matches.length>1 && (matches[0].priority??0)===(matches[1].priority??0)) return fail("overlap","A loja precisa conferir as zonas sobrepostas antes de confirmar a taxa de entrega.");
  const zone=matches[0], subtotal=Math.round(input.subtotal*100), minimum=deliveryMoneyCents(zone.orderMinimum), threshold=deliveryMoneyCents(zone.freeDeliveryThreshold), price=deliveryMoneyCents(zone.price);
  if(!Number.isSafeInteger(subtotal) || subtotal<0 || price===null || zone.orderMinimum!=null && minimum===null || zone.freeDeliveryThreshold!=null && threshold===null) return fail("invalid_price","A loja precisa cadastrar uma taxa de entrega válida para esta área.",zone);
  if(minimum!==null && subtotal<minimum) return fail("below_minimum",`O pedido mínimo para esta área é ${(minimum/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}.`,zone);
  return {zone,amount:threshold!==null && subtotal>=threshold ? 0 : price/100,source,reason:"available",error:null};
}
