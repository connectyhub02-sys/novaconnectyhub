import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientProductsMarketplace } from "@/components/connectyhub-os/client-products-marketplace";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { listClientCompanies } from "@/lib/client-os/companies";
import { getClientPlatformProductCatalog } from "@/lib/platform-products";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Produtos | ConnectyHub",
  description: "Produtos ConnectyHub que podem ser importados para venda por comissao no WhatsApp.",
};

export default async function DashboardProdutosPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fprodutos");
  }

  const client = createServiceClient();
  const companies = await listClientCompanies(workspace.user.id, client);
  const catalog = await getClientPlatformProductCatalog({
    userId: workspace.user.id,
    companyIds: companies.map((company) => company.id),
    client,
  });
  const organization = workspace.organization;
  const organizationCompanyId = organization && companies.some((company) => company.id === organization.id)
    ? organization.id
    : null;

  return (
    <ConnectyShell
      activeHref="/dashboard/produtos"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <ClientProductsMarketplace
        catalog={catalog}
        companies={companies}
        initialCompanyId={organizationCompanyId ?? companies[0]?.id ?? null}
      />
    </ConnectyShell>
  );
}
