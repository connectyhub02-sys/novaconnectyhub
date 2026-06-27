import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ClientApiConsole } from "@/components/connectyhub-os/client-api-console";
import { ensureClientApiClient, getClientGatewayState } from "@/lib/connectyhub-api/gateway";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API WhatsApp | ConnectyHub",
  description: "Painel do cliente para chaves, webhooks, instancias e consumo da API WhatsApp.",
};

export default async function DashboardApiWhatsappPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fapi-whatsapp");
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    redirect("/dashboard/empresa");
  }

  await ensureClientApiClient({
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    contactEmail: workspace.profile.email,
    actorId: workspace.user.id,
  });

  const state = await getClientGatewayState({ organizationId: organization.id });

  return (
    <ClientApiConsole
      canManage={workspace.profile.isPlatformAdmin || organization.role === "owner" || organization.role === "admin"}
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      state={state}
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization.name}
    />
  );
}
