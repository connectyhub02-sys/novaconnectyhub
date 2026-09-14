import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSalesCatalogSkus, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { isSalesCatalogDisplayableProduct } from "./shared";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const filler = new Set("voce voces tem teria quero queria gostaria preciso procura procurando tenho pode poderia mostrar mostra ver saber compra comprar produto produtos opcao opcoes algum alguma bom boa dia tarde noite ola oi sim nao por favor para uma uns umas com que qual quais esse essa isso ele ela tambem mais outro outra outros outras levar inclui inclua adiciona adicione incluir adicionar me seu sua no na de do da os as um o a e em".split(" "));
export function catalogSearchPlan(messages: Array<{ direction: string; text_content: string | null }>) {
  let page = 0;
  for (const message of [...messages].reverse()) {
    if (message.direction !== "inbound") continue;
    const text = normalize(message.text_content ?? "");
    if (/^(?:me (?:mostra|mostre) |quero ver )?(?:mais|outras?|outros?|proximas?) (?:opcoes|produtos|itens|resultados)\b/.test(text)) { page++; continue; }
    const terms = text.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu)?.filter(term => term.length > 1 && !filler.has(term)) ?? [];
    if (terms.length) return { query: [...new Set(terms)].slice(0, 12).join(" "), offset: page * 20 };
  }
  return { query: "", offset: page * 20 };
}

export async function searchRuntimeCatalog(client: SupabaseClient, input: {
  organizationId: string; agentId: string; instanceId: string;
  messages: Array<{ direction: string; text_content: string | null }>;
  referencedIds?: string[];
}) {
  const plan = catalogSearchPlan(input.messages);
  const { data, error } = await client.rpc("search_runtime_catalog", {
    p_org: input.organizationId, p_agent: input.agentId, p_instance: input.instanceId,
    p_query: plan.query, p_offset: plan.offset, p_limit: 20, p_ids: [...new Set(input.referencedIds ?? [])].slice(0, 80),
  });
  if (error || !data || !Array.isArray(data.items)) throw new Error("Busca do catálogo indisponível.");
  const items = await attachSalesCatalogSkus(client, data.items.map(mapSalesCatalogItem).filter(isSalesCatalogDisplayableProduct), { strict: true });
  return { ...plan, items, hasMore: data.has_more === true };
}
