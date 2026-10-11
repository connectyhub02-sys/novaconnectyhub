import Link from "next/link";
import { connection } from "next/server";
import { getMetaWorkspace } from "@/lib/meta/company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaWhatsAppConsole } from "@/components/connectyhub-os/meta-whatsapp-console";
import { PageHeader, Panel } from "@/components/connectyhub-os/panel-primitives";
export const metadata = {title:"Meta · Operação e testes | ConnectyHub"};
export default async function AdminMetaPage() {
  await connection();const workspace=await getMetaWorkspace();
  if(!workspace?.profile.isPlatformAdmin)return <AccessDenied />;
  const result = await createServiceClient().from("organization_integrations")
    .select("status,external_account_label,scopes,metadata")
    .eq("organization_id",workspace.organization!.id).eq("provider_id","meta-ads").maybeSingle();
  const social = result.data;
  const assets = social?.metadata && typeof social.metadata === "object" ? social.metadata as Record<string,unknown> : {};
  return <ConnectyShell mode="admin" activeHref="/admin/meta" isPlatformAdmin userLabel={workspace.profile.email ?? undefined}>
    <PageHeader title="Meta · Operação e testes" description="WhatsApp oficial da ConnectyHub, configuração e evidências para análise da Meta." />
    <Panel title="Facebook, Instagram e anúncios" className="mb-5">
      <p className="text-sm">O login Meta já está disponível nas integrações. As permissões concedidas à conexão determinam quais ativos e ações podem ser usados.</p>
      <p className="mt-3 text-sm">Conexão interna: {result.error ? "Não foi possível consultar" : social?.status === "connected" ? social.external_account_label || "Conectada" : "Aguardando autorização"}</p>
      <p className="mt-2 break-words text-xs text-slate-400">Permissões concedidas: {(social?.scopes as string[] | undefined)?.join(", ") || "Nenhuma conexão interna autorizada"}</p>
      <p className="mt-2 text-xs">Página: {String(assets.selected_facebook_page_id || assets.facebook_page_id || "—")} · Instagram: {String(assets.selected_instagram_business_id || assets.instagram_business_id || "—")} · Conta de anúncios: {String(assets.selected_ad_account_id || assets.ad_account_id || "—")}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-400"><a href="/api/dashboard/integrations/meta/connect">Conectar Facebook e Instagram</a><Link href="/admin/trafego/meta-ads">Analisar Meta Ads</Link><Link href="/admin/meta/publicacoes">Publicações e calendário</Link><Link href="/admin/maintenance">Credenciais e manutenção</Link></div>
      <p className="mt-3 text-xs text-slate-500">TikTok e YouTube têm aplicativos e autorizações próprios. A aprovação deste app Meta não libera essas plataformas.</p>
    </Panel>
    <MetaWhatsAppConsole admin />
  </ConnectyShell>;
}
