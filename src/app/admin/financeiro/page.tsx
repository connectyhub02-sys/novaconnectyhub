import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { BillingCenter } from "@/components/connectyhub-os/billing-center";
import { getBillingCommercialCatalog } from "@/lib/billing/admin-catalog";
import { getBillingAdminSummary } from "@/lib/billing/summary";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Financeiro IA | ConnectyHub",
  description: "Centro de custo, creditos, consumo e margem da plataforma ConnectyHub.",
};

export default async function AdminFinanceiroPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const [summary, commercialCatalog] = await Promise.all([
    getBillingAdminSummary(),
    getBillingCommercialCatalog(),
  ]);

  return (
    <BillingCenter
      summary={summary}
      commercialCatalog={commercialCatalog}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
