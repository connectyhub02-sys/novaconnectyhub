import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { WhatsAppConsole } from "@/components/connectyhub-os/whatsapp-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campanhas WhatsApp | ConnectyHub",
  description: "Controles de Status, canais, grupos e campanhas WhatsApp processados pelo Inngest.",
};

export default async function CampaignsPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fcampanhas");
  }

  if (!workspace.organization) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/campanhas"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization.name ?? profile.companyName ?? "Workspace"}
    >
      <WhatsAppConsole />
    </ConnectyShell>
  );
}
