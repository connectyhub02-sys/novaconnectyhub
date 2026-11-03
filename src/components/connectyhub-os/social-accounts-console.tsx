"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleHelp, Link2, Loader2, Video, Music2, Globe2 } from "lucide-react";
import { PageHeader } from "./panel-primitives";
import type { SocialAccountsOverview, SocialProvider, SocialShell } from "@/lib/social/policy";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50";
export function SocialAccountsConsole({ overview, shell, companyId, outcome }: { overview: SocialAccountsOverview; shell: SocialShell; companyId: string; outcome?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState(outcome === "connected" ? "Autorização recebida. Confirme abaixo a conta que deseja utilizar." : outcome === "cancelled" ? "A conexão foi cancelada. Você pode tentar novamente quando quiser." : outcome === "error" ? "Não foi possível concluir a conexão. Confirme sua sessão e tente conectar novamente." : "");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [disconnecting, setDisconnecting] = useState<SocialProvider | null>(null);
  async function act(provider: SocialProvider, action: "connect" | "check" | "disconnect" | "select") {
    setBusy(`${provider}:${action}`); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/social/${provider}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shell, companyId, accountId: selected[provider] ?? overview.connections.find(c => c.provider === provider)?.selectedAccountId }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Não foi possível concluir a operação.");
      if (result.url) { window.location.assign(result.url); return; }
      setNotice(result.message); setDisconnecting(null); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Operação indisponível."); }
    finally { setBusy(null); }
  }
  return <section className="space-y-5">
    <PageHeader eyebrow="Redes sociais" title="Contas conectadas" description="Escolha as contas da sua empresa e acompanhe a disponibilidade de cada rede." />
    {notice && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
    {!overview.schemaReady && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">As conexões YouTube e TikTok estão em preparação. {shell === "admin" ? "Aplique a migration 0220 para habilitar o armazenamento seguro das autorizações." : "Você poderá conectar suas contas assim que a configuração for concluída."}</p>}
    {!overview.canManage && <p className="text-sm text-slate-500">Você pode consultar as contas. Peça a um gestor da empresa para conectar ou alterar uma conta.</p>}
    <div className="grid gap-5 xl:grid-cols-3">
      <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
        <Globe2 className="mb-4 text-blue-600" size={28}/><h2 className="text-lg font-semibold">Instagram e Facebook</h2>
        <p className="mt-2 text-sm text-slate-600">{!overview.meta.available ? "Consulta indisponível" : overview.meta.connected ? "Conexão registrada" : "Nenhuma conta conectada"}</p>
        {overview.meta.account && <p className="mt-2 break-words font-medium">{overview.meta.account}</p>}
        <p className="mb-5 mt-3 text-sm leading-6 text-slate-500">{overview.meta.connected && overview.meta.publishingScopes ? "Permissões de publicação registradas. O envio confere o acesso atual e os ativos selecionados." : "A publicação depende da conexão, dos ativos selecionados e das permissões concedidas pela Meta."}</p>
        <Link className={`${button} mt-auto`} href={shell === "admin" ? "/admin/meta" : "/dashboard/integracoes#meta-ads-guiado"}><Link2 size={16}/>Gerenciar Meta</Link>
      </article>
      {overview.connections.map(account => {
        const name = account.provider === "youtube" ? "YouTube" : "TikTok";
        const Icon = account.provider === "youtube" ? Video : Music2;
        const ready = overview.schemaReady && account.configured;
        const disabled = Boolean(busy) || !overview.canManage;
        return <article key={account.provider} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
          <Icon className="mb-4 text-slate-800" size={28}/><h2 className="text-lg font-semibold">{name}</h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">{account.connected ? <CheckCircle2 size={16} className="text-emerald-600"/> : <CircleHelp size={16}/>}{account.status === "checking" ? "Verificação em andamento" : account.status === "reconnect" ? "Reconexão necessária" : account.connected ? "Conta autorizada" : ready ? "Pronta para conectar" : "Integração em preparação"}</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">{account.provider === "youtube" ? "Conecte o canal pelo Google e confirme a conta autorizada. Esta conexão é independente do Google Ads." : "Autorize sua conta pelo TikTok. A publicação pública dependerá também da aprovação do aplicativo."}</p>
          <p className="mb-4 mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Selecione a conta de destino e prepare seu vídeo em Publicações. O envio depende da aprovação de cada publicação e das permissões da rede.</p>
          {account.accounts.length > 0 && <label className="mb-4 block text-sm font-medium">{name === "YouTube" ? "Canal autorizado" : "Conta autorizada"}
            <select className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2" value={selected[account.provider] ?? account.selectedAccountId ?? ""} disabled={disabled || !account.connected} onChange={e => setSelected(s => ({ ...s, [account.provider]: e.target.value }))}>
              <option value="">Selecione a conta</option>{account.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>}
          <div className="mt-auto flex flex-wrap gap-2">
            <button type="button" className={button} disabled={disabled || !ready} onClick={() => void act(account.provider, "connect")}>
              {busy === `${account.provider}:connect` ? <Loader2 size={16} className="animate-spin"/> : <Link2 size={16}/>}{account.status !== "disconnected" ? "Reconectar" : `Conectar ${name}`}
            </button>
            {account.connected && <>
              <button type="button" className={secondary} disabled={disabled || !(selected[account.provider] ?? account.selectedAccountId)} onClick={() => void act(account.provider, "select")}>Salvar escolha</button>
              <button type="button" className={secondary} disabled={disabled || !ready} onClick={() => void act(account.provider, "check")}>Verificar conexão</button>
            </>}
            {account.status !== "disconnected" && <button type="button" className={secondary} disabled={disabled} onClick={() => setDisconnecting(account.provider)}>Desconectar</button>}
          </div>
          {disconnecting === account.provider && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <p>Desconectar, revogar a autorização e excluir os dados recebidos desta rede na ConnectyHub? Isso remove tokens, perfil e identificadores dos envios, interrompe entregas pendentes e mantém seus vídeos originais e o resultado do histórico. Um envio já recebido pela rede pode concluir; confira no próprio perfil. Os vídeos publicados na rede não serão apagados. Para voltar a usar a conta, será necessário reconectar.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondary} disabled={disabled} onClick={() => void act(account.provider, "disconnect")}>Confirmar desconexão</button><button type="button" className={secondary} disabled={disabled} onClick={() => setDisconnecting(null)}>Cancelar</button></div>
          </div>}
          {shell === "admin" && !account.configured && <Link className="mt-4 text-sm text-blue-700 underline" href="/admin/maintenance">Configurar aplicativo na manutenção</Link>}
        </article>;
      })}
    </div>
    <p className="text-sm text-slate-500">As autorizações e os arquivos pertencem à empresa selecionada. Gestores podem remover as conexões por esta tela.</p>
    <p className="text-sm text-slate-500">Antes de conectar, consulte os <Link href="/termos" className="underline">Termos de Uso</Link> e a <Link href="/privacidade" className="underline">Política de Privacidade</Link>. A conexão autoriza o acesso ao perfil e o envio de vídeos que você aprovar. Você pode excluir os dados da integração ao desconectar.</p>
  </section>;
}
