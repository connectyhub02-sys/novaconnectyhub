import { getMetaWorkspace } from "@/lib/meta/company-access";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AdminMetaSocial } from "@/components/connectyhub-os/admin-meta-social";
export const dynamic = "force-dynamic";
export default async function Page() {
  const workspace = await getMetaWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied />;
  return <ConnectyShell mode="admin" activeHref="/admin/meta" isPlatformAdmin userLabel={workspace.profile.email ?? undefined}><AdminMetaSocial /></ConnectyShell>;
}
