import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { SalesCatalogConsole } from "@/components/connectyhub-os/sales-catalog-console";
import { listClientCompanies } from "@/lib/client-os/companies";
import { listClientSalesCatalog, listClientSalesCatalogOrders, listClientSalesCatalogSettings, listClientSalesCatalogShippingSettings } from "@/lib/client-os/sales-catalog";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catalogo de Vendas | ConnectyHub",
  description: "Catalogo de itens que o agente pode apresentar e enviar no WhatsApp.",
};

export default async function DashboardLinksPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Flinks");
  }

  const client = createServiceClient();
  const [companies, items, settings, shippingSettings, orders] = await Promise.all([
    listClientCompanies(workspace.user.id, client),
    listClientSalesCatalog({ userId: workspace.user.id, client }),
    listClientSalesCatalogSettings({ userId: workspace.user.id, client }),
    listClientSalesCatalogShippingSettings({ userId: workspace.user.id, client }),
    listClientSalesCatalogOrders({ userId: workspace.user.id, client }),
  ]);
  const organization = workspace.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/links"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <SalesCatalogConsole
        initialCompanies={companies}
        initialCompanyId={organization?.id ?? companies[0]?.id ?? null}
        initialItems={items}
        initialOrders={orders}
        initialSettings={settings}
        initialShippingSettings={shippingSettings}
      />
    </ConnectyShell>
  );
}
