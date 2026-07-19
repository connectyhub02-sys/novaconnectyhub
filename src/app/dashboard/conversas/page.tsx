import type { Metadata } from "next";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { getClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { listClientSocialApprovals } from "@/lib/client-os/social-approvals";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Conversas | ConnectyHub",
  description: "Inbox de conversas dos leads em WhatsApp, Instagram e Facebook.",
};

export default async function ConversationsPage() {
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;
  const organization = workspace?.organization;
  const leadWorkspace = workspace?.user.id
    ? await getClientLeadCrmWorkspace({ userId: workspace.user.id })
    : { companies: [], leads: [], stats: { total: 0, new: 0, active: 0, qualified: 0, converted: 0, archived: 0 } };
  const socialApprovals = workspace?.user.id
    ? await listClientSocialApprovals({ userId: workspace.user.id }).catch(() => [])
    : [];

  return (
    <ConnectyShell
      activeHref="/dashboard/conversas"
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      mode="client"
      userAvatarUrl={profile?.avatarUrl ?? null}
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    >
      <LeadCrmConsole mode="conversas" socialApprovals={socialApprovals} workspace={leadWorkspace} />
    </ConnectyShell>
  );
}
