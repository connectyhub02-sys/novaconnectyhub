import type { Metadata } from "next";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { WhatsAppConsole } from "@/components/connectyhub-os/whatsapp-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Agentes | ConnectyHub",
  description: "Central para criar agentes, conectar WhatsApp, ajustar prompt e controlar o atendimento.",
};

export default async function AgentsPage() {
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;
  const organization = workspace?.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/whatsapp"
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      mode="client"
      userAvatarUrl={profile?.avatarUrl ?? null}
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    >
      <WhatsAppConsole />
    </ConnectyShell>
  );
}
