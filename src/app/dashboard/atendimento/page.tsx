import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { LeadCrmConsole } from "@/components/connectyhub-os/leads-crm-console";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import { getClientLeadCrmWorkspace, type ClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import {
  listClientSalesCatalog,
  listClientSalesCatalogOrders,
  listClientSalesCatalogPaymentSessions,
} from "@/lib/client-os/sales-catalog";
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

  if (!company) {
    redirect("/dashboard/empresa");
  }

  const leadWorkspace = await getClientLeadCrmWorkspace({
    userId: workspace.user.id,
    organizationId: organization.id,
    company,
    includeEvents: false,
    leadLimit: 80,
    messageLimit: 50,
    syncAvatars: false,
  }).catch((error) => {
    console.error("[Attendance] Falha ao carregar workspace de leads", error);
    return buildUnavailableLeadWorkspace(company);
  });
  const salesCatalogItems = await listClientSalesCatalog({
    userId: workspace.user.id,
    companyId: organization.id,
  }).catch(() => []);
  const [salesCatalogOrders, salesCatalogPaymentSessions] = await Promise.all([
    listClientSalesCatalogOrders({
      userId: workspace.user.id,
      companyId: organization.id,
    }).catch(() => []),
    listClientSalesCatalogPaymentSessions({
      userId: workspace.user.id,
      companyId: organization.id,
    }).catch(() => []),
  ]);
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
        salesCatalogItems={salesCatalogItems}
        salesCatalogOrders={salesCatalogOrders}
        salesCatalogPaymentSessions={salesCatalogPaymentSessions}
        socialApprovals={socialApprovals}
        socialDispatchMonitor={socialDispatchMonitor ?? undefined}
        workspace={leadWorkspace}
      />
    </ConnectyShell>
  );
}

function buildUnavailableLeadWorkspace(company: NonNullable<ReturnType<typeof currentOrganizationToClientCompany>>): ClientLeadCrmWorkspace {
  return {
    companies: [company],
    attendanceQueues: [],
    leads: [],
    stats: {
      total: 0,
      new: 0,
      active: 0,
      qualified: 0,
      converted: 0,
      archived: 0,
    },
    warnings: [
      "Nao foi possivel carregar conversas e leads agora. O painel continua acessivel para nova tentativa.",
    ],
  };
}
