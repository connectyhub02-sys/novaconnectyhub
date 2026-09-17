import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { InfrastructureProject } from "@/components/connectyhub-os/infrastructure-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ project: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied />;
  const { project } = await params;
  return <InfrastructureProject key={project} projectId={project} />;
}
