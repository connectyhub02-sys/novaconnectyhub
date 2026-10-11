import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaInstagramOverview } from "@/components/connectyhub-os/meta-instagram-overview";
import { MetaOrganicConsole } from "@/components/connectyhub-os/meta-organic-console";
import { MetaSocialInbox } from "@/components/connectyhub-os/meta-social-inbox";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getClientMetaOrganicOverview } from "@/lib/meta/organic-publishing";
import { metaWorkspaceItems } from "@/lib/meta/workspace-navigation";
export const metadata = { title: "Meta | ConnectyHub" };
export default async function MetaArea({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  await connection();
  const { area } = await params;
  if (area === "campanhas") redirect("/dashboard/chat-meta?tab=campaigns");
  if (area === "agentes") redirect("/dashboard/whatsapp");
  if (area === "modelos") redirect("/dashboard/chat-meta?tab=models");
  if (
    !["analise", "atendimento", "calendario", "criativos"].includes(
      area,
    )
  )
    notFound();
  const workspace = await getCurrentWorkspace();
  if (!workspace) redirect("/login?next=/dashboard/meta");
  if (!workspace.organization) redirect("/dashboard/empresa");
  const company = await requireClientCompanyAccess({
    userId: workspace.user.id,
    companyId: workspace.organization.id,
  });
  const organic =
    area === "calendario" || area === "criativos"
      ? await getClientMetaOrganicOverview({
          userId: workspace.user.id,
          organizationId: company.id,
        })
      : null;
  const title =
    metaWorkspaceItems.find((item) => item.key === area)?.label ?? "Meta";
  return (
    <ConnectyShell
      mode="client"
      activeHref={`/dashboard/meta/${area}`}
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={company.name}
    >
      <Link
        href="/dashboard/meta"
        className="mb-4 inline-block text-sm text-blue-600"
      >
        ← Central Meta
      </Link>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">{title}</h1>
      {area === "analise" && (
        <>
          <p className="mb-5 text-sm text-slate-500">
            Perfil e publicações consultados na conta conectada. Métricas
            avançadas dependem das permissões de insights.
          </p>
          <MetaInstagramOverview
            userId={workspace.user.id}
            organizationId={company.id}
          />
        </>
      )}
      {area === "atendimento" && <MetaSocialInbox />}
      {organic && (
        <MetaOrganicConsole
          overview={organic}
          initialView={area === "calendario" ? "calendar" : "library"}
        />
      )}
    </ConnectyShell>
  );
}
