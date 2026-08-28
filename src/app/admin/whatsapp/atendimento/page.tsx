import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminWhatsappAtendimentoConsole } from "@/components/connectyhub-os/admin-whatsapp-atendimento-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getPlatformWhatsappAgentsWorkspace } from "@/lib/admin/platform-whatsapp-agents";
import { getAdminLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import { getAdminPlatformProductCatalog } from "@/lib/platform-products";
import { mapPlatformProductToClientSalesCatalogItem } from "@/lib/platform-products-sales-catalog";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "WhatsApp Interno | ConnectyHub",
  description: "Agentes WhatsApp da propria operacao ConnectyHub vinculados aos setores internos.",
};

export default async function AdminWhatsappAtendimentoPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const client = createServiceClient();
  const [leadWorkspace, whatsappWorkspace, platformCatalog] = await Promise.all([
    getAdminLeadCrmWorkspace({
      client,
      limit: 400,
      scope: "platform_internal",
    }),
    getPlatformWhatsappAgentsWorkspace(client),
    getAdminPlatformProductCatalog(client),
  ]);
  const campaignWorkspace = {
    sectors: whatsappWorkspace.sectors.map((sector) => ({
      id: sector.id,
      name: sector.name,
      description: sector.description,
      status: sector.status,
    })),
    agents: whatsappWorkspace.agents
      .filter((agent) => Boolean(agent.sectorId))
      .map((agent) => ({
        id: agent.id,
        companyId: agent.sectorId!,
        name: agent.name,
        personaName: agent.personaName,
        roleTitle: agent.roleTitle,
        status: agent.status,
      })),
    products: platformCatalog.products
      .filter((product) => product.status === "active")
      .map((product) => mapPlatformProductToClientSalesCatalogItem(product)),
  };

  return (
    <ConnectyShell
      activeHref="/admin/whatsapp/atendimento"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <AdminWhatsappAtendimentoConsole campaignWorkspace={campaignWorkspace} leadWorkspace={leadWorkspace} />
    </ConnectyShell>
  );
}
