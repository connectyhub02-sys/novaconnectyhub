import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { BillingPlansConsole } from "@/components/connectyhub-os/billing-plans-console";
import { getBillingPlanCatalog } from "@/lib/billing/plans";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Planos | ConnectyHub",
  description: "Configuracao dos planos, creditos e assinatura mensal da ConnectyHub.",
};

export default async function AdminPlanosPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const catalog = await getBillingPlanCatalog();

  return (
    <BillingPlansConsole
      catalog={catalog}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
