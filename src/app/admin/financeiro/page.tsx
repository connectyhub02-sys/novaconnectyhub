import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { BillingCenter } from "@/components/connectyhub-os/billing-center";
import { getBillingCommercialCatalog } from "@/lib/billing/admin-catalog";
import { getPlatformBillingOperationsCatalog } from "@/lib/billing/platform-billing-admin";
import { getBillingAdminSummary } from "@/lib/billing/summary";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { getOperationAudit } from "@/lib/billing/operation-audit";

export const metadata: Metadata = {
  title: "Financeiro IA | ConnectyHub",
  description: "Centro de custo, creditos, consumo e margem da plataforma ConnectyHub.",
};

export default async function AdminFinanceiroPage({searchParams}:{searchParams:Promise<{usageDays?:string}>}) {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const requestedDays=Number((await searchParams).usageDays),days=[1,7,30].includes(requestedDays)?requestedDays:1;
  const [summary, commercialCatalog, platformBillingCatalog, operationAudit] = await Promise.all([
    getBillingAdminSummary(),
    getBillingCommercialCatalog(),
    getPlatformBillingOperationsCatalog(),
    getOperationAudit(createServiceClient(),days),
  ]);

  return (
    <BillingCenter
      summary={summary}
      commercialCatalog={commercialCatalog}
      platformBillingCatalog={platformBillingCatalog}
      operationAudit={operationAudit}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
