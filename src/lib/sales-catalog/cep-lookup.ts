import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCep, peekCepPlace, rememberCepPlace, type CepPlace } from "./cep-place";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const lookupTimeoutMs = 3500;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

async function fetchJson(fetcher: Fetcher, url: string) {
  const response = await fetcher(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(lookupTimeoutMs) });
  if (!response.ok) return null;
  return await response.json() as Record<string, unknown>;
}

async function lookupDirectory(fetcher: Fetcher, cep: string): Promise<(CepPlace & { source: "viacep" | "brasilapi" }) | null> {
  const viacep = await fetchJson(fetcher, `https://viacep.com.br/ws/${cep}/json/`).catch(() => null);
  if (viacep && viacep.erro !== true && viacep.erro !== "true" && text(viacep.localidade)) {
    return { cep, street: text(viacep.logradouro), neighborhood: text(viacep.bairro), city: text(viacep.localidade), uf: text(viacep.uf), source: "viacep" };
  }
  const brasil = await fetchJson(fetcher, `https://brasilapi.com.br/api/cep/v2/${cep}`).catch(() => null);
  if (brasil && text(brasil.city)) {
    return { cep, street: text(brasil.street), neighborhood: text(brasil.neighborhood), city: text(brasil.city), uf: text(brasil.state), source: "brasilapi" };
  }
  return null;
}

/**
 * Resolves the district and city of each CEP before a delivery quote, so the quote (which is
 * synchronous) can match neighborhood zones by the CEP instead of by how the customer typed it.
 * Order: memory, shared database cache, ViaCEP, BrasilAPI. Never throws: without an answer the
 * quote keeps using only the address text.
 */
export async function prefetchCepPlaces(client: SupabaseClient | null, ceps: Iterable<string | null | undefined>, fetcher: Fetcher = fetch) {
  const pending = [...new Set([...ceps].map(normalizeCep).filter((cep): cep is string => Boolean(cep)))]
    .filter(cep => peekCepPlace(cep) === undefined).slice(0, 5);
  if (!pending.length) return;
  const stored = client ? await client.from("cep_places").select("cep, street, neighborhood, city, uf").in("cep", pending)
    .then(({ data }) => (data ?? []) as CepPlace[], () => [] as CepPlace[]) : [];
  for (const place of stored) rememberCepPlace(place.cep, place);
  await Promise.all(pending.filter(cep => !stored.some(place => place.cep === cep)).map(async cep => {
    const found = await lookupDirectory(fetcher, cep).catch(() => null);
    rememberCepPlace(cep, found ? { cep, street: found.street, neighborhood: found.neighborhood, city: found.city, uf: found.uf } : null);
    if (found && client) await client.from("cep_places").upsert({ ...found, fetched_at: new Date().toISOString() }).then(() => null, () => null);
  }));
}
