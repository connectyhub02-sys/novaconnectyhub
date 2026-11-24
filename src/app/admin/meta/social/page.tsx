import Link from "next/link";
import { connection } from "next/server";
import { getMetaWorkspace } from "@/lib/meta/company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaSocialConnectionActions } from "@/components/connectyhub-os/meta-social-connection-actions";
import { Panel, PageHeader } from "@/components/connectyhub-os/panel-primitives";
import { metaRecord, selectedMetaAsset } from "@/lib/meta/ads-leads-context";
export const metadata = { title: "Instagram e Facebook | ConnectyHub" };
export default async function Page() {
  await connection();
  const workspace = await getMetaWorkspace();
  if (!workspace?.profile.isPlatformAdmin || !workspace.organization) return <AccessDenied/>;
  const result = await createServiceClient().from("organization_integrations").select("status,external_account_label,scopes,metadata").eq("organization_id", workspace.organization.id).eq("provider_id", "meta-ads").maybeSingle();
  const assetRows = await createServiceClient().from("integration_assets").select("external_id,label").eq("organization_id", workspace.organization.id).eq("provider_id", "meta-ads").in("asset_type", ["facebook_page", "instagram_business_account", "meta_ad_account"]);
  const social = result.data, assets = metaRecord(social?.metadata);
  const entries = [
    { label: "Página Facebook", id: selectedMetaAsset(assets, "facebook_page_id"), items: assets.facebook_pages },
    { label: "Instagram", id: selectedMetaAsset(assets, "instagram_business_id"), items: assets.instagram_accounts },
    { label: "Conta de anúncios", id: selectedMetaAsset(assets, "ad_account_id"), items: assets.ad_accounts },
  ];
  return <ConnectyShell mode="admin" activeHref="/admin/redes-sociais/contas" isPlatformAdmin userLabel={workspace.profile.email ?? undefined}>
    <PageHeader title="Instagram e Facebook" description="Perfis, publicações, atendimento e anúncios da operação própria."/>
    <div className="mb-5 flex flex-wrap gap-3 text-sm"><Link className="text-blue-700" href="/admin/redes-sociais/contas">Todas as conexões</Link><Link className="text-blue-700" href="/admin/meta">WhatsApp oficial — conexão independente</Link></div>
    <Panel title="Perfis e conta de anúncios" className="mb-5"><p className="text-sm">{result.error ? "Não foi possível consultar a conexão." : social?.status === "connected" ? "Conexão autorizada" : "Conecte os perfis que deseja usar"}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">{entries.map(entry => {
        const match = (Array.isArray(entry.items) ? entry.items : []).map(metaRecord).find(a => a.id === entry.id);
        const name = assetRows.data?.find(a => a.external_id === entry.id)?.label || match?.name || match?.username || (entry.label === "Conta de anúncios" ? social?.external_account_label : null);
        return <div key={entry.label} className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">{entry.label}</p><p className="mt-2 break-words text-sm font-medium">{entry.id ? String(name || `${entry.label} selecionado`) : "Nenhum selecionado"}</p>{entry.id && <p className="mt-1 break-all text-xs text-slate-500">{entry.id}</p>}</div>;
      })}</div>
      <div className="mt-5"><MetaSocialConnectionActions companyId={workspace.organization.id} shell="admin" connected={social?.status === "connected"}/></div>
      <div className="mt-5 flex flex-wrap gap-3"><Link className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" href="/admin/redes-sociais/publicacoes?create=1">Criar publicação</Link><Link className="rounded-lg border px-4 py-2 text-sm" href="/admin/redes-sociais/publicacoes">Ver publicações</Link><Link className="rounded-lg border px-4 py-2 text-sm" href="/admin/meta/atendimento">Abrir caixa de entrada</Link><Link className="rounded-lg border px-4 py-2 text-sm" href="/admin/trafego/meta-ads">Meta Ads</Link></div>
      <p className="mt-4 text-sm text-slate-500">Você pode usar Instagram e Facebook sem conectar o WhatsApp oficial. Cada conexão mantém seus próprios ativos autorizados.</p>
      <details className="mt-4 text-sm"><summary className="cursor-pointer text-slate-600">Permissões e manutenção</summary><p className="mt-2 break-words text-xs text-slate-500">{(social?.scopes as string[] | undefined)?.join(", ") || "Nenhuma permissão registrada"}</p><Link className="mt-3 inline-block text-blue-700" href="/admin/maintenance">Abrir manutenção</Link></details>
    </Panel>

  </ConnectyShell>;
}
