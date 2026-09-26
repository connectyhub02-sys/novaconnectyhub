import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type BirthdayGiftKind = "favorites_discount" | "order_discount" | "gift_product";
export type BirthdayGift = { kind: BirthdayGiftKind; percent: number | null; productId: string | null };

/**
 * The birthday present chosen by the owner in Automações. Null means "only the congratulations" (the
 * default), including while the setting does not exist yet in the database.
 */
export async function loadBirthdayGift(client: SupabaseClient, organizationId: string): Promise<BirthdayGift | null> {
  const { data, error } = await client.from("automation_policies").select("birthday_gift_kind,birthday_gift_percent,birthday_gift_product_id")
    .eq("organization_id", organizationId).maybeSingle<{ birthday_gift_kind: string | null; birthday_gift_percent: number | string | null; birthday_gift_product_id: string | null }>();
  if (error || !data) return null;
  const percent = data.birthday_gift_percent == null ? null : Number(data.birthday_gift_percent);
  if (data.birthday_gift_kind === "favorites_discount" || data.birthday_gift_kind === "order_discount") {
    return percent && percent > 0 && percent <= 30 ? { kind: data.birthday_gift_kind, percent, productId: null } : null;
  }
  if (data.birthday_gift_kind === "gift_product" && data.birthday_gift_product_id) {
    return { kind: "gift_product", percent: null, productId: data.birthday_gift_product_id };
  }
  return null;
}
