import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminProductComplianceConsole } from "@/components/connectyhub-os/admin-product-compliance-console";
import { listPlatformComplianceRules } from "@/lib/compliance/product-compliance";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Compliance e Restrição de Produtos | Admin OS",
  description: "Governança e restrição dinâmica de substâncias e produtos por país para agentes de atendimento e vendas.",
};

export default async function AdminProductCompliancePage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const client = createServiceClient();
  const initialRules = await listPlatformComplianceRules(client);

  return (
    <AdminProductComplianceConsole
      initialRules={initialRules}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
