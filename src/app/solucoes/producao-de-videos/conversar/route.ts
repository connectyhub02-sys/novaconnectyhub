import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { globalWhatsappFallback, videoWhatsappUrl } from "@/lib/marketing/video-service";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let phone = globalWhatsappFallback;
  try {
    const client = createServiceClient();
    const signal = AbortSignal.timeout(2500);
    const settings = await client.from("platform_billing_settings").select("billing_whatsapp_agent_id")
      .eq("setting_key", "default").abortSignal(signal).maybeSingle();
    const agentId = settings.data?.billing_whatsapp_agent_id;
    if (agentId) {
      const instance = await client.from("whatsapp_instances").select("phone_number")
        .contains("metadata", { agent_id: agentId, admin_whatsapp: true, platform_whatsapp: true })
        .neq("status", "archived").order("updated_at", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
      if (instance.data?.phone_number) phone = instance.data.phone_number;
    }
  } catch { /* Keep public contact available during a database outage. */ }
  const response = NextResponse.redirect(videoWhatsappUrl(phone, new URL(request.url).searchParams.get("estilo")), 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
