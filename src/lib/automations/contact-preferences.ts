import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextContactIntersection } from "./contact-window";
export async function checkContactPreferences(
  client: SupabaseClient,
  org: string,
  leadId: string,
  timezone: string,
  start = "09:00",
  end = "20:00",
) {
  const result = await client
    .from("automation_lead_profiles")
    .select("preferences")
    .eq("organization_id", org)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (result.error)
    throw new Error("Não foi possível verificar as preferências de contato.");
  const p = result.data?.preferences ?? {};
  if (p.paused === true)
    return { reason: "lead_follow_up_paused", deferUntil: null };
  if (typeof p.windowStart === "string" && typeof p.windowEnd === "string") {
    const now = new Date(),
      next = nextContactIntersection(
        now,
        [
          { start, end },
          { start: p.windowStart, end: p.windowEnd },
        ],
        timezone,
      );
    if (!next)
      return { reason: "no_compatible_contact_window", deferUntil: null };
    if (next.getTime() > now.getTime())
      return { reason: null, deferUntil: next.toISOString() };
  }
  return { reason: null, deferUntil: null };
}
