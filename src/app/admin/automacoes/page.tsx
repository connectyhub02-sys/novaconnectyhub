import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { PlatformAutomationsCenter } from "@/components/connectyhub-os/platform-automations-center";
import { getPlatformAutomationsCatalog } from "@/lib/automations/platform-automations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Automacoes | ConnectyHub",
  description: "Fluxos de follow-up, mensagens de billing e automacoes comerciais da ConnectyHub.",
};

export default async function AdminAutomacoesPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const catalog = await getPlatformAutomationsCatalog();

  return (
    <PlatformAutomationsCenter
      catalog={catalog}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
