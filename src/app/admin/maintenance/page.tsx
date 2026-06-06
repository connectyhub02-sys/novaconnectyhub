import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { MaintenanceRoom } from "@/components/connectyhub-os/maintenance-room";
import type { MaintenanceStoredCredential } from "@/lib/maintenance-vault";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Sala de Manutencao | ConnectyHub",
  description: "Cofre operacional da ConnectyHub para credenciais, APIs, webhooks e diagnosticos de plataforma.",
};

export default async function AdminMaintenancePage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const storedCredentials = await getStoredPlatformCredentials();

  return <MaintenanceRoom storedCredentials={storedCredentials} userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"} />;
}

async function getStoredPlatformCredentials(): Promise<MaintenanceStoredCredential[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_credentials")
    .select("integration_id, env_name, value_preview")
    .eq("scope", "platform")
    .is("organization_id", null)
    .order("updated_at", { ascending: false });

  return data ?? [];
}
