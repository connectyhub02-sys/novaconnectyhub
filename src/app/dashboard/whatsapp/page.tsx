import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { WhatsAppConsole } from "@/components/connectyhub-os/whatsapp-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agentes | ConnectyHub",
  description: "Central para criar agentes, conectar WhatsApp, ajustar prompt e controlar o atendimento.",
};

type AgentsPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

export default async function AgentsPage({ searchParams }: AgentsPageProps) {
  const params = (await searchParams) ?? {};
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fwhatsapp");
  }

  if (!workspace.organization) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;

  if (isWhatsappAutomationTab(params.tab)) {
    redirect("/dashboard/automacoes");
  }

  return (
    <ConnectyShell
      activeHref="/dashboard/whatsapp"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization.name ?? profile.companyName ?? "Workspace"}
    >
      <WhatsAppConsole initialTab="connection" />
    </ConnectyShell>
  );
}

function isWhatsappAutomationTab(value: string | undefined) {
  if (value === "campanhas" || value === "grupos-campanhas" || value === "grupos") {
    return true;
  }

  return false;
}
