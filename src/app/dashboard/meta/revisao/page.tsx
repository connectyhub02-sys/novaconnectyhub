import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AdminMetaSocial } from "@/components/connectyhub-os/admin-meta-social";
import { MetaPixelPanel } from "@/components/connectyhub-os/meta-pixel-panel";
import { MetaAdsLeadsPanel } from "@/components/connectyhub-os/meta-ads-leads-panel";

export const dynamic = "force-dynamic";
export default async function MetaReviewPage() {
  const workspace = await getCurrentWorkspace();
  const review = workspace && readMetaReviewAccess(workspace.user);
  if (!workspace || workspace.profile.isPlatformAdmin || !review?.active || workspace.organization?.id !== review.organizationId) return <AccessDenied />;
  return <ConnectyShell mode="client" activeHref="/dashboard/meta/atendimento" isPlatformAdmin={false} userLabel={workspace.profile.email ?? undefined} workspaceName={workspace.organization.name}><AdminMetaSocial review /><MetaAdsLeadsPanel /><MetaPixelPanel /></ConnectyShell>;
}
