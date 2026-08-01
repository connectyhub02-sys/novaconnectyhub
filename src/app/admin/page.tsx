import type { Metadata } from "next";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminConsole } from "@/components/connectyhub-os/admin-console";
import { getAdminDashboardOverview } from "@/lib/admin/dashboard-overview";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAdminMarketingOverview } from "@/lib/tracking/admin-marketing";

export const metadata: Metadata = {
  title: "Admin OS | ConnectyHub",
  description: "Painel administrativo interno da ConnectyHub para clientes, agentes, tokens, manutencao e auditoria.",
};

export default async function AdminPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const [overview, marketing] = await Promise.all([
    getAdminDashboardOverview(),
    getAdminMarketingOverview(),
  ]);

  return <AdminConsole userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"} overview={overview} marketing={marketing} />;
}
