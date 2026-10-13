/**
 * Street, district and city of a CEP, as the postal directory knows them. The delivery quote reads
 * this cache synchronously; cep-lookup.ts fills it (memory, database, then ViaCEP/BrasilAPI).
 */
export type CepPlace = { cep: string; street: string | null; neighborhood: string | null; city: string | null; uf: string | null };

const places = new Map<string, { place: CepPlace | null; expiresAt: number }>();
const maxEntries = 5000;

export function normalizeCep(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

/** A failed lookup is remembered briefly (null) so one message does not query the directory again and again. */
export function rememberCepPlace(cep: string, place: CepPlace | null, ttlMs = place ? 7 * 24 * 3600_000 : 5 * 60_000) {
  const key = normalizeCep(cep);
  if (!key) return;
  if (places.size >= maxEntries) places.delete(places.keys().next().value!);
  places.set(key, { place, expiresAt: Date.now() + ttlMs });
}

/** undefined: never looked up (or expired); null: looked up without a usable answer. */
export function peekCepPlace(cep: string | null | undefined): CepPlace | null | undefined {
  const key = normalizeCep(cep);
  const entry = key ? places.get(key) : undefined;
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) { places.delete(key!); return undefined; }
  return entry.place;
}

export function readCepPlace(cep: string | null | undefined) {
  return peekCepPlace(cep) ?? null;
}

const normalized = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Same place name, ignoring accents, case and punctuation ("Balneario camboriu" = "Balneário Camboriú"). */
export function samePlaceName(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && normalized(left) && normalized(left) === normalized(right));
}

/** Adds the district and city of the CEP that the customer did not write, for the order and the courier. */
export function completeAddressWithCepPlace(address: string, place: CepPlace | null | undefined) {
  if (!place) return address;
  const text = ` ${normalized(address)} `;
  const missing = [place.neighborhood, place.city && place.uf ? `${place.city} - ${place.uf}` : place.city]
    .filter((part): part is string => Boolean(part) && !text.includes(` ${normalized(part!.replace(/ - [A-Z]{2}$/, ""))} `));
  return missing.length ? `${address.replace(/[,;\s]+$/, "")}, ${missing.join(", ")}` : address;
}
