import type { Metadata } from "next";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { getAdminLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "CRM Leads | Admin OS",
  description: "CRM administrativo de leads da ConnectyHub com conversas, qualificacao e rastreamento.",
};

export default async function AdminLeadsPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const leadWorkspace = await getAdminLeadCrmWorkspace();

  return (
    <ConnectyShell
      activeHref="/admin/leads"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <LeadCrmConsole mode="leads" workspace={leadWorkspace} />
    </ConnectyShell>
  );
}
