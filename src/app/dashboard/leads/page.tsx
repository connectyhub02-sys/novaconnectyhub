import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { getClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leads | ConnectyHub",
  description: "Lista de leads capturados pelo WhatsApp e links rastreados.",
};

export default async function LeadsPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fleads");
  }

  if (!workspace.organization) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;
  const leadWorkspace = await getClientLeadCrmWorkspace({ userId: workspace.user.id });

  return (
    <ConnectyShell
      activeHref="/dashboard/leads"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization.name ?? profile.companyName ?? "Workspace"}
    >
      <LeadCrmConsole mode="leads" workspace={leadWorkspace} />
    </ConnectyShell>
  );
}
