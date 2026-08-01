import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { getClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM | ConnectyHub",
  description: "CRM de leads com qualificacao, historico e atividade rastreada.",
};

export default async function CrmPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fcrm");
  }

  if (!workspace.organization) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;
  const leadWorkspace = await getClientLeadCrmWorkspace({ userId: workspace.user.id });

  return (
    <ConnectyShell
      activeHref="/dashboard/crm"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization.name ?? profile.companyName ?? "Workspace"}
    >
      <LeadCrmConsole mode="crm" workspace={leadWorkspace} />
    </ConnectyShell>
  );
}
