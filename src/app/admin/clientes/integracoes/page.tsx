import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminClientIntegrationsConsole } from "@/components/connectyhub-os/admin-client-integrations-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getAdminClientIntegrationsOverview, parseAdminClientIntegrationFilters } from "@/lib/admin/client-integrations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Integracoes dos clientes | Admin OS",
  description: "Controle das conexoes Meta, Google, Mercado Pago e Webhooks feitas pelos clientes.",
};

type AdminClientIntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminClientIntegrationsPage({ searchParams }: AdminClientIntegrationsPageProps) {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const filters = parseAdminClientIntegrationFilters(await searchParams);
  const overview = await getAdminClientIntegrationsOverview(filters);

  return (
    <ConnectyShell
      activeHref="/admin/clientes/integracoes"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <AdminClientIntegrationsConsole overview={overview} />
    </ConnectyShell>
  );
}
