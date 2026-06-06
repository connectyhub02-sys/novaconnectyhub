import type { Metadata } from "next";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { WhatsAppConsole } from "@/components/connectyhub-os/whatsapp-console";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "WhatsApp | ConnectyHub",
  description: "Console de integração Uazapi para conectar WhatsApp, enviar mensagens e configurar webhooks.",
};

export default async function WhatsAppPage() {
  const organization = await ensureStarterOrganization();
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;

  return (
    <ConnectyShell
      activeHref="/dashboard/whatsapp"
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      mode="client"
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Minha empresa"}
    >
      <WhatsAppConsole />
    </ConnectyShell>
  );
}
