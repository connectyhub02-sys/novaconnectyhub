import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AutonomousCommandCenter } from "@/components/connectyhub-os/autonomous-command-center";
import { getAutonomousAdminOverview } from "@/lib/autonomous-os/admin";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Agentes IA | ConnectyHub",
  description: "Setores, prompts e funcionarios IA internos da ConnectyHub.",
};

export default async function AdminAgentesPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const overview = await getAutonomousAdminOverview();

  return (
    <AutonomousCommandCenter
      overview={overview}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
      view="agents"
    />
  );
}
