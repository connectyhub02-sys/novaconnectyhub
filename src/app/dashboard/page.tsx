import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientDashboard } from "@/components/connectyhub-os/client-dashboard";
import { getClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Dashboard | ConnectyHub",
  description: "Painel do cliente ConnectyHub para leads, conversas, agentes, links rastreaveis e automacoes.",
};

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard");
  }

  if (workspace?.profile.isPlatformAdmin && params.view !== "client") {
    redirect("/admin");
  }

  if (!workspace.organization && !workspace.profile.isPlatformAdmin) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;
  const overview = await getClientDashboardOverview({
    userId: workspace.user.id,
    organizationId: organization?.id,
    company: organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          planCode: organization.planCode,
          status: organization.status,
          role: organization.role,
          createdAt: null,
        }
      : null,
  });

  return (
    <ClientDashboard
      overview={overview}
      isPlatformAdmin={profile.isPlatformAdmin}
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    />
  );
}
