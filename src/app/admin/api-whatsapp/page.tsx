import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyHubApiConsole } from "@/components/connectyhub-os/connectyhub-api-console";
import { getAdminGatewayState } from "@/lib/connectyhub-api/gateway";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "API WhatsApp | ConnectyHub",
  description: "Painel admin para revenda e controle da API WhatsApp ConnectyHub.",
};

export default async function AdminApiWhatsappPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const state = await getAdminGatewayState();

  return <ConnectyHubApiConsole state={state} userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"} />;
}
