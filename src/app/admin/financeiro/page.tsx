import { loadBillingReliability, loadBillingAttention, billingReliabilityIssues } from "@/lib/billing/reliability";
import { BillingAttentionDetails } from "@/components/connectyhub-os/billing-attention";
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
import { getAgentOptimizationAdmin, getCostCenterMonth } from "@/lib/billing/cost-center-month";

export const metadata: Metadata = {
  title: "Financeiro IA | ConnectyHub",
  description: "Centro de custo, creditos, consumo e margem da plataforma ConnectyHub.",
};

export default async function AdminFinanceiroPage({searchParams}:{searchParams:Promise<{usageDays?:string;month?:string}>}) {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const params=await searchParams,requestedDays=Number(params.usageDays),days=[1,7,30].includes(requestedDays)?requestedDays:1;
  const [summary, commercialCatalog, platformBillingCatalog, operationAudit, costCenterMonth, agentOptimizations] = await Promise.all([
    getBillingAdminSummary(),
    getBillingCommercialCatalog(),
    getPlatformBillingOperationsCatalog(),
    getOperationAudit(createServiceClient(),days),
    getCostCenterMonth(createServiceClient(), params.month),
    getAgentOptimizationAdmin(createServiceClient()),
  ]);

  const [reliability, attention] = await Promise.all([
    loadBillingReliability(createServiceClient()).catch(() => null),
    loadBillingAttention(createServiceClient()).catch(() => null),
  ]);
  const issues = reliability ? billingReliabilityIssues(reliability) : [];
  return (<>
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 text-slate-900" aria-label="Saúde das cobranças">
      <h2 className="text-lg font-semibold">Saúde das cobranças</h2>
      {!reliability || !attention ? <p role="alert">Conferência financeira incompleta. Atualize a página.</p> : issues.length || attention.pendingCount ? <>
        <p role="alert" className="mt-2 text-amber-800">Há pendências que precisam de atenção. Veja abaixo o cliente, a data e a orientação de cada registro.</p>
        <ul className="mt-3 list-inside list-disc text-sm">{issues.map(issue => <li key={issue.key}>{issue.label}: <strong>{issue.count}</strong></li>)}</ul>
        {reliability.blockedNotices > 0 ? <p className="mt-3 text-sm">Confira a ativação dos avisos e a conexão do WhatsApp financeiro em WhatsApp Interno. Avisos aguardando conexão serão retomados se ainda forem válidos.</p> : null}
        {reliability.uncertainNotices > 0 ? <p className="mt-3 text-sm">As entregas incertas permanecem retidas para evitar duplicidade. Não reenvie enquanto o resultado não estiver confirmado.</p> : null}
      </> : <p className="mt-2 text-emerald-800">Nenhuma pendência detectada nesta conferência. A aprovação das próximas cobranças depende do banco.</p>}
      <BillingAttentionDetails data={attention} />
    </section>
    <BillingCenter
      summary={summary}
      commercialCatalog={commercialCatalog}
      platformBillingCatalog={platformBillingCatalog}
      operationAudit={operationAudit}
      costCenterMonth={costCenterMonth}
      agentOptimizations={agentOptimizations}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  </>);
}
