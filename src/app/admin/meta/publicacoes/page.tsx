import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaOrganicConsole } from "@/components/connectyhub-os/meta-organic-console";
import { getMetaWorkspace } from "@/lib/meta/company-access";
import { getClientMetaOrganicOverview } from "@/lib/meta/organic-publishing";

export const metadata = { title: "Publicações Meta | ConnectyHub" };
export default async function AdminMetaPosts() {
  await connection();
  const workspace = await getMetaWorkspace();
  if (!workspace?.profile.isPlatformAdmin || !workspace.organization) return <AccessDenied />;
  const overview = await getClientMetaOrganicOverview({ userId: workspace.user.id, organizationId: workspace.organization.id });
  return <ConnectyShell mode="admin" activeHref="/admin/meta" isPlatformAdmin userLabel={workspace.profile.email ?? undefined}>
    <MetaOrganicConsole overview={overview} />
  </ConnectyShell>;
}
