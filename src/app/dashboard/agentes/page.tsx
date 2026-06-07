import type { Metadata } from "next";
import { ClientAgentsConsole } from "@/components/connectyhub-os/client-agents-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Agentes | ConnectyHub",
  description: "Cadastro de agentes de WhatsApp vinculados as empresas do cliente.",
};

export default async function AgentsPage() {
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;
  const organization = workspace?.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/agentes"
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      mode="client"
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    >
      <ClientAgentsConsole />
    </ConnectyShell>
  );
}
