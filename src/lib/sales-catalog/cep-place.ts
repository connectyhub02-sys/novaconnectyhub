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

const formatCep = (cep: string) => `${cep.slice(0, 5)}-${cep.slice(5)}`;

/**
 * "88330786, 61" or "cep 88330-786 número 61": the CEP gives street, district and city, so the customer
 * only types the house number. Needs an explicit number next to the CEP or after "número"/"nº"; a city-wide
 * CEP (no street) is never turned into an address.
 */
export function addressFromCepAndNumber(text: string, place: CepPlace | null | undefined) {
  if (!place?.street) return null;
  const cep = String.raw`\d{5}-?\d{3}`;
  const number = new RegExp(String.raw`\b(?:n[uú]mero|num\.?|n[º°o]\.?)\s*[:\-]?\s*(\d{1,6})\b`, "i").exec(text)?.[1]
    ?? new RegExp(String.raw`\b${cep}\s*[,;\-]\s*(\d{1,6})(?![\d-])`).exec(text)?.[1]
    ?? new RegExp(String.raw`(?<![\d-])(\d{1,5})\s*[,;\-]\s*${cep}\b`).exec(text)?.[1];
  if (!number) return null;
  const complement = /\b(?:ap(?:to|artamento)?\.?|bloco|sala|casa|fundos)\s*[:\-]?\s*[\w-]+/i.exec(text)?.[0];
  const city = place.city && place.uf ? `${place.city} - ${place.uf}` : place.city;
  return [place.street, number, complement, place.neighborhood, city, `CEP ${formatCep(place.cep)}`].filter(Boolean).join(", ");
}

/** One line per CEP for the agent: the official address it should confirm instead of asking again. */
export function describeCepPlaceForAgent(cep: string, place: CepPlace | null) {
  if (!place) return `CEP ${formatCep(cep)}: não encontrado na consulta. Peça para o cliente conferir o CEP (ou informar rua, bairro e cidade).`;
  const where = [place.neighborhood, place.city && place.uf ? `${place.city}/${place.uf}` : place.city].filter(Boolean).join(", ");
  return place.street
    ? `CEP ${formatCep(cep)}: ${place.street}, ${where}. Não pergunte rua, bairro nem cidade; peça só o número (e complemento, se houver) e confirme o endereço com o cliente.`
    : `CEP ${formatCep(cep)}: CEP geral de ${where}, sem rua. Peça rua, número e bairro.`;
}
