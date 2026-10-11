import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaWorkspaceHome } from "@/components/connectyhub-os/meta-workspace-home";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
export const metadata = { title: "Central Meta | ConnectyHub" };
export default async function MetaHome() {
  await connection();
  const workspace = await getCurrentWorkspace();
  if (!workspace) redirect("/login?next=/dashboard/meta");
  if (!workspace.organization) redirect("/dashboard/empresa");
  const client = createServiceClient();
  const company = await requireClientCompanyAccess({
    client,
    userId: workspace.user.id,
    companyId: workspace.organization.id,
  });
  const integration = await client
    .from("organization_integrations")
    .select("status,scopes")
    .eq("organization_id", company.id)
    .eq("provider_id", "meta-ads")
    .maybeSingle();
  const scopes = Array.isArray(integration.data?.scopes)
    ? integration.data.scopes.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];
  return (
    <ConnectyShell
      mode="client"
      activeHref="/dashboard/meta"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={company.name}
    >
      <MetaWorkspaceHome
        connected={integration.data?.status === "connected"}
        scopes={scopes}
        unavailable={Boolean(integration.error)}
      />
    </ConnectyShell>
  );
}
