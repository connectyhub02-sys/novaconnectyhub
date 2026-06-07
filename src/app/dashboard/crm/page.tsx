import type { Metadata } from "next";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { getClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "CRM | ConnectyHub",
  description: "CRM de leads com qualificacao, historico e atividade rastreada.",
};

export default async function CrmPage() {
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;
  const organization = workspace?.organization;
  const leadWorkspace = workspace?.user.id
    ? await getClientLeadCrmWorkspace({ userId: workspace.user.id })
    : { companies: [], leads: [], stats: { total: 0, new: 0, active: 0, qualified: 0, converted: 0, archived: 0 } };

  return (
    <ConnectyShell
      activeHref="/dashboard/crm"
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      mode="client"
      userAvatarUrl={profile?.avatarUrl ?? null}
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    >
      <LeadCrmConsole mode="crm" workspace={leadWorkspace} />
    </ConnectyShell>
  );
}
