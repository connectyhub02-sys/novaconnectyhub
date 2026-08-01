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
  title: "Conversas | ConnectyHub",
  description: "Inbox de conversas dos leads em WhatsApp, Instagram e Facebook.",
};

export default async function ConversationsPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fconversas");
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
      activeHref="/dashboard/conversas"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization.name ?? profile.companyName ?? "Workspace"}
    >
      <LeadCrmConsole
        mode="conversas"
        socialApprovals={socialApprovals}
        socialDispatchMonitor={socialDispatchMonitor ?? undefined}
        workspace={leadWorkspace}
      />
    </ConnectyShell>
  );
}
