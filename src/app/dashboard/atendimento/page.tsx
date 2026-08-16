import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import { getClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import {
  listClientSocialApprovals,
  listClientSocialDispatchMonitor,
} from "@/lib/client-os/social-approvals";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atendimento | ConnectyHub",
  description: "Central de atendimento com conversas, leads, CRM e controle do agente.",
};

export default async function AttendancePage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fatendimento");
  }

  if (!workspace.organization) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;
  const company = currentOrganizationToClientCompany(organization);
  const leadWorkspace = await getClientLeadCrmWorkspace({
    userId: workspace.user.id,
    organizationId: organization.id,
    company,
  });
  const socialApprovals = await listClientSocialApprovals({
    userId: workspace.user.id,
    organizationId: organization.id,
    company,
  }).catch(() => []);
  const socialDispatchMonitor = await listClientSocialDispatchMonitor({
    userId: workspace.user.id,
    organizationId: organization.id,
    company,
  }).catch(() => null);

  return (
    <ConnectyShell
      activeHref="/dashboard/atendimento"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization.name ?? profile.companyName ?? "Workspace"}
    >
      <LeadCrmConsole
        mode="atendimento"
        socialApprovals={socialApprovals}
        socialDispatchMonitor={socialDispatchMonitor ?? undefined}
        workspace={leadWorkspace}
      />
    </ConnectyShell>
  );
}
