import { createServiceClient } from "@/lib/supabase/service";
import { normalizePlatformWhatsapp, platformWhatsappFallback } from "@/lib/marketing/platform-whatsapp-phone";

/**
 * Phone of the active admin attendance instance of the platform agent (billing_whatsapp_agent_id).
 * Connecting another number in the admin panel changes the public links without a deploy.
 */
export async function resolvePlatformWhatsappPhone() {
  try {
    const client = createServiceClient();
    const signal = AbortSignal.timeout(2500);
    const settings = await client.from("platform_billing_settings").select("billing_whatsapp_agent_id")
      .eq("setting_key", "default").abortSignal(signal).maybeSingle();
    const agentId = settings.data?.billing_whatsapp_agent_id;
    if (!agentId) return platformWhatsappFallback;
    const instance = await client.from("whatsapp_instances").select("phone_number")
      .contains("metadata", { agent_id: agentId, admin_whatsapp: true, platform_whatsapp: true })
      .neq("status", "archived").order("updated_at", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
    return normalizePlatformWhatsapp(instance.data?.phone_number);
  } catch {
    return platformWhatsappFallback;
  }
}
