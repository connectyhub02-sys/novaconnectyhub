import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export async function resolveOrganizationId(client: ReturnType<typeof createServiceClient>, sectorId: string) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("organization_id")
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ organization_id: string }>();

  if (data?.organization_id) {
    return data.organization_id;
  }

  const { data: org } = await client
    .from("organizations")
    .select("id")
    .eq("slug", "connectyhub-platform-whatsapp")
    .maybeSingle<{ id: string }>();

  if (!org?.id) {
    throw new Error("Conecte o WhatsApp do setor antes de ouvir a previa da voz.");
  }

  return org.id;
}
