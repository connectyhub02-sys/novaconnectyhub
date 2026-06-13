import type { Metadata } from "next";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { WhatsAppConsole } from "@/components/connectyhub-os/whatsapp-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Campanhas WhatsApp | ConnectyHub",
  description: "Controles de Status, canais, grupos e campanhas WhatsApp processados pelo Inngest.",
};

export default async function CampaignsPage() {
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;
  const organization = workspace?.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/campanhas"
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
