import type { Metadata } from "next";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { InfrastructureInventory } from "@/components/connectyhub-os/infrastructure-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Infraestrutura | ConnectyHub" };
export default async function Page() {
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied />;
  return <InfrastructureInventory />;
}
