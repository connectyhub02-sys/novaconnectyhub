import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ConnectyShell } from "./connecty-shell";
import { AccessDenied } from "./access-denied";
import { MetaOrganicConsole } from "./meta-organic-console";
import { SocialAccountsConsole } from "./social-accounts-console";
import { FeatureUpgradePanel } from "./feature-upgrade-panel";
import { SocialPublishingConsole } from "./social-publishing-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { getClientMetaOrganicOverview } from "@/lib/meta/organic-publishing";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { socialAccess } from "@/lib/social/access";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";
import { socialAccountsOverview } from "@/lib/social/connections";
import { socialAreas, socialNavigation, socialPath, type SocialArea, type SocialShell } from "@/lib/social/policy";

export async function SocialWorkspacePage({ shell, area, outcome, initialCompose = false }: { shell: SocialShell; area: string; outcome?: string; initialCompose?: boolean }) {
  await connection();
  if (!socialAreas.includes(area as SocialArea)) notFound();
  // Client connected accounts moved into Conexões; keep OAuth outcomes and old links working.
  if (shell === "client" && area === "contas") redirect(`/dashboard/integracoes${outcome ? `?connection=${encodeURIComponent(outcome)}` : ""}#redes-sociais`);
  const workspace = shell === "admin" ? await getMetaWorkspace() : await getCurrentWorkspace();
  if (!workspace) redirect(`/login?next=${encodeURIComponent(socialPath(shell, area as SocialArea))}`);
  if (shell === "admin" && !workspace.profile.isPlatformAdmin) return <AccessDenied/>;
  if (!workspace.organization) redirect("/dashboard/empresa");
  const company = await requireMetaCompanyAccess({ userId: workspace.user.id, companyId: workspace.organization.id });
  let content;
  if (area === "contas") {
    const access = await socialAccess(shell);
    const overview = await socialAccountsOverview(access.client, access.organizationId, access.canManage).catch(() => null);
    content = overview
      ? <SocialAccountsConsole overview={overview} companyId={company.id} shell={shell} outcome={outcome}/>
      : <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Não foi possível consultar as conexões. Atualize a página para tentar novamente.</p>;
  } else {
    const entitlement = resolvePlanFeatureEntitlement("meta_organic_insights", { isPlatformAdmin: workspace.profile.isPlatformAdmin, organizationStatus: company.status, planCode: company.planCode, featureOverrides: company.featureOverrides });
    if (!entitlement.allowed) content = <FeatureUpgradePanel entitlement={entitlement} title="Publicações" description="Disponível nos planos ativos, conforme as permissões da conta."/>;
    else {
      const overview = await getClientMetaOrganicOverview({ userId: workspace.user.id, organizationId: company.id }).catch(() => null);
      content = readMetaReviewAccess(workspace.user) ? (overview ? <MetaOrganicConsole overview={overview} companyId={company.id} initialView={area === "calendario" ? "calendar" : area === "biblioteca" ? "library" : "compose"}/> : <p role="alert">Não foi possível carregar o histórico Meta.</p>) : <SocialPublishingConsole key={`${company.id}:${area}`} companyId={company.id} shell={shell} area={area} initialCompose={initialCompose} canManage={["owner","admin"].includes(company.role)} legacyPosts={overview?.items ?? []} metaComposer={area !== "biblioteca" ? <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="mb-4 text-sm text-slate-600">Fotos, carrosséis, stories e histórico dos formatos Meta. Para o mesmo vídeo em quatro redes, use a aba Vídeo.</p>{overview ? <MetaOrganicConsole overview={overview} companyId={company.id} initialView="compose" socialShell={shell}/> : <p role="alert">Não foi possível consultar os formatos Meta. Atualize a página.</p>}</div> : undefined}/>;
    }
  }
  return <ConnectyShell mode={shell} activeHref={socialPath(shell, area as SocialArea)} isPlatformAdmin={workspace.profile.isPlatformAdmin} userAvatarUrl={workspace.profile.avatarUrl} userLabel={workspace.profile.email ?? undefined} workspaceName={company.name}>
    <nav aria-label="Redes sociais" className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">{socialNavigation(shell).map(item => <Link key={item.key} href={item.href} aria-current={area === item.key ? "page" : undefined} className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${area === item.key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-600"}`}>{item.label}</Link>)}</nav>
    {shell === "admin" && <p className="mb-4 text-sm text-slate-500">Operação própria · {company.name}</p>}
    {content}
  </ConnectyShell>;
}
