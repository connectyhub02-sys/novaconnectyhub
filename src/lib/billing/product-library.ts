import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContractAccess } from "./contract-access";

export type PurchasedProduct = {
  id: string; buyer_user_id: string; product_id: string; title: string;
  billing_cycle: "one_time" | "recurring"; state: "active" | "revoked" | "review";
  billing_organization_id: string | null; starts_at: string; ends_at: string | null; created_at: string;
};
export type ProductContent = { body: string; files: { key: string; name: string; type: string }[] };

export async function listPurchasedProducts(client: SupabaseClient, userId: string) {
  const claimed = await client.rpc("claim_verified_product_purchases", { p_user: userId });
  if (claimed.error) throw new Error("Não foi possível vincular suas compras confirmadas.");
  const rows: PurchasedProduct[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await client.from("platform_product_entitlements").select("id,buyer_user_id,product_id,title,billing_cycle,state,billing_organization_id,starts_at,ends_at,created_at")
      .eq("buyer_user_id", userId).eq("state", "active").order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (result.error) throw new Error("Não foi possível consultar seus produtos.");
    rows.push(...(result.data ?? []) as PurchasedProduct[]);
    if ((result.data?.length ?? 0) < 500) break;
  }
  const now = Date.now();
  const access = new Map<string, boolean>();
  const visible: PurchasedProduct[] = [];
  for (const product of rows) {
    if (Date.parse(product.starts_at) > now || (product.ends_at && Date.parse(product.ends_at) <= now)) continue;
    if (product.billing_cycle === "recurring") {
      const org = product.billing_organization_id;
      if (!org) continue;
      if (!access.has(org)) access.set(org, (await getContractAccess(org, client)).allowed);
      if (!access.get(org)) continue;
    }
    visible.push(product);
  }
  return visible;
}

export async function loadPurchasedProduct(client: SupabaseClient, userId: string, entitlementId: string) {
  const result = await client.from("platform_product_entitlements").select("id,buyer_user_id,product_id,title,billing_cycle,state,billing_organization_id,starts_at,ends_at,created_at")
    .eq("id", entitlementId).eq("buyer_user_id", userId).eq("state", "active").maybeSingle<PurchasedProduct>();
  if (result.error) throw new Error("Não foi possível conferir sua compra.");
  const product = result.data;
  if (!product || Date.parse(product.starts_at) > Date.now() || (product.ends_at && Date.parse(product.ends_at) <= Date.now())) return null;
  if (product.billing_cycle === "recurring" && (!product.billing_organization_id || !(await getContractAccess(product.billing_organization_id, client)).allowed)) return null;
  const content = await client.from("platform_product_contents").select("body,files").eq("product_id", product.product_id).maybeSingle<ProductContent>();
  if (content.error) throw new Error("Não foi possível abrir o conteúdo.");
  return { product, content: content.data ?? { body: "Seu produto está registrado. A equipe está preparando as instruções de acesso.", files: [] } };
}
