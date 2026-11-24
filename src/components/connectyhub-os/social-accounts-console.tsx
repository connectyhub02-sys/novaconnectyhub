"use client";

import Link from "next/link";
import { panelTheme } from "@/lib/ui/panel-theme";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Link2, Loader2, Settings2, X } from "lucide-react";
import { MetaSocialConnectionActions } from "./meta-social-connection-actions";
import { PageHeader } from "./panel-primitives";
import { SocialBrandMark, type SocialBrand } from "./social-brand-marks";
import type { SocialAccountsOverview, SocialConnectionCard, SocialProvider, SocialShell } from "@/lib/social/policy";

const primary = "inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-50";
type Tone = "ok" | "attention" | "idle";
const dot: Record<Tone, string> = { ok: "bg-emerald-500", attention: "bg-amber-500", idle: "bg-slate-300" };

/** embedded: dentro de Conexões do cliente, onde Meta e WhatsApp já têm cartões próprios. */
export function SocialAccountsConsole({ overview, shell, companyId, outcome, embedded = false, cardsOnly = false }: { overview: SocialAccountsOverview; shell: SocialShell; companyId: string; outcome?: string; embedded?: boolean; cardsOnly?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState(outcome === "connected" ? "Autorização recebida. Abra Gerenciar e confirme a conta que deseja utilizar." : outcome === "cancelled" ? "A conexão foi cancelada. Você pode tentar novamente quando quiser." : outcome === "error" ? "Não foi possível concluir a conexão. Confirme sua sessão e tente conectar novamente." : "");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [disconnecting, setDisconnecting] = useState<SocialProvider | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function act(provider: SocialProvider, action: "connect" | "check" | "disconnect" | "select") {
    setBusy(`${provider}:${action}`); setNotice("");
    try {
      const response = await fetch(`/api/dashboard/social/${provider}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shell, companyId, accountId: selected[provider] ?? overview.connections.find(c => c.provider === provider)?.selectedAccountId }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Não foi possível concluir a operação.");
      if (result.url) { window.location.assign(result.url); return; }
      setNotice(result.message); setDisconnecting(null); setOpen(null); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Operação indisponível."); }
    finally { setBusy(null); }
  }

  const meta = overview.meta;
  const metaTone: Tone = meta.connected ? "ok" : "idle";
  const metaStatus = !meta.available ? "Consulta indisponível" : meta.connected ? "Conectada" : "Não conectada";
  const metaConnectHref = `/api/dashboard/integrations/meta/connect?companyId=${encodeURIComponent(companyId)}`;

  return <section className={cardsOnly ? "contents" : "space-y-4"}>
    {!cardsOnly && (embedded ? <h2 className="text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>YouTube e TikTok</h2> : <PageHeader eyebrow="Redes sociais" title="Contas conectadas" description="As contas da sua empresa em cada rede. Toque em Gerenciar para reconectar, trocar ou desconectar." />)}
    {notice && <p role="status" className="col-span-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {!overview.schemaReady && <p role="status" className="col-span-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">As conexões YouTube e TikTok estão em preparação. {shell === "admin" ? "Aplique a migration 0220 para habilitar o armazenamento seguro das autorizações." : "Você poderá conectar suas contas assim que a configuração for concluída."}</p>}
    {!overview.canManage && <p className="col-span-full text-sm text-slate-500">Você pode consultar as contas. Peça a um gestor da empresa para conectar ou alterar uma conta.</p>}

    <div className={cardsOnly ? "contents" : embedded ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
      {!embedded && <AccountTile brands={["instagram", "facebook"]} name="Instagram e Facebook" tone={metaTone} status={metaStatus} account={meta.account}>
        {meta.connected
          ? <button type="button" className={secondary + " w-full"} onClick={() => setOpen("meta")}><Settings2 size={14}/>Gerenciar</button>
          : overview.canManage ? <a className={primary} href={metaConnectHref}><Link2 size={14}/>Conectar</a> : <button type="button" className={secondary + " w-full"} onClick={() => setOpen("meta")}>Detalhes</button>}
      </AccountTile>}

      {!embedded && <AccountTile brands={["whatsapp"]} name="WhatsApp oficial" tone="idle" status="Conexão independente" account={null}>
        <Link className={secondary + " w-full"} href={shell === "admin" ? "/admin/meta" : "/dashboard/chat-meta"}><Settings2 size={14}/>Gerenciar</Link>
      </AccountTile>}

      {overview.connections.map(account => {
        const name = account.provider === "youtube" ? "YouTube" : "TikTok";
        const ready = overview.schemaReady && account.configured;
        const { tone, status } = providerStatus(account, ready);
        const accountName = account.accounts.find(a => a.id === account.selectedAccountId)?.name ?? null;
        const canConnect = ready && overview.canManage && account.status === "disconnected";
        return <AccountTile key={account.provider} brands={[account.provider]} name={name} tone={tone} status={status} account={accountName}>
          {canConnect && !cardsOnly
            ? <button type="button" className={primary} disabled={Boolean(busy)} onClick={() => void act(account.provider, "connect")}>
                {busy === `${account.provider}:connect` ? <Loader2 size={14} className="animate-spin"/> : <Link2 size={14}/>}Conectar
              </button>
            : <button type="button" className={secondary + " w-full"} onClick={() => setOpen(account.provider)}><Settings2 size={14}/>{!cardsOnly && account.status === "disconnected" ? "Detalhes" : "Gerenciar"}</button>}
        </AccountTile>;
      })}
    </div>

    <p className="col-span-full text-xs leading-5 text-slate-500">
      As autorizações e os arquivos pertencem à empresa selecionada; gestores podem remover as conexões por esta tela. Antes de conectar, consulte os <Link href="/termos" className="underline">Termos de Uso</Link> e a <Link href="/privacidade" className="underline">Política de Privacidade</Link>. A conexão autoriza o acesso ao perfil e o envio das publicações que você aprovar; ao desconectar, você pode excluir os dados da integração.
    </p>

    {!embedded && <AccountDialog open={open === "meta"} onClose={() => setOpen(null)} brands={["instagram", "facebook"]} title="Instagram e Facebook" status={metaStatus} account={meta.account}>
      <p>{meta.connected && meta.publishingScopes ? "Permissões de publicação registradas. Cada envio confere o acesso atual e os perfis selecionados." : "A publicação depende da conexão, dos perfis selecionados e das permissões concedidas pela Meta."}</p>
      <MetaSocialConnectionActions companyId={companyId} shell={shell} connected={meta.connected} canManage={overview.canManage}/>
      <Link className="inline-block text-blue-700 underline" href={shell === "admin" ? "/admin/meta/social" : "/dashboard/integracoes#meta-ads-guiado"}>Ver perfis e permissões</Link>
    </AccountDialog>}

    {overview.connections.map(account => {
      const name = account.provider === "youtube" ? "YouTube" : "TikTok";
      const ready = overview.schemaReady && account.configured;
      const disabled = Boolean(busy) || !overview.canManage;
      const accountName = account.accounts.find(a => a.id === account.selectedAccountId)?.name ?? null;
      return <AccountDialog key={account.provider} open={open === account.provider} onClose={() => { setOpen(null); setDisconnecting(null); }} brands={[account.provider]} title={name} status={providerStatus(account, ready).status} account={accountName}>
        <p>{account.provider === "youtube" ? "Conecte o canal pelo Google e confirme a conta autorizada. Esta conexão é independente do Google Ads." : "Autorize sua conta pelo TikTok. A publicação pública depende também da aprovação do aplicativo pelo TikTok."}</p>
        <p className="text-slate-500">Escolha a conta de destino aqui e prepare o vídeo em Publicações. Cada envio depende da sua aprovação e das permissões da rede.</p>
        {account.accounts.length > 0 && <label className="block font-medium">{name === "YouTube" ? "Canal autorizado" : "Conta autorizada"}
          <select className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 font-normal" value={selected[account.provider] ?? account.selectedAccountId ?? ""} disabled={disabled || !account.connected} onChange={e => setSelected(s => ({ ...s, [account.provider]: e.target.value }))}>
            <option value="">Selecione a conta</option>{account.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>}
        <div className="flex flex-wrap gap-2">
          {account.connected && <>
            <button type="button" className={secondary} disabled={disabled || !(selected[account.provider] ?? account.selectedAccountId)} onClick={() => void act(account.provider, "select")}>Salvar escolha</button>
            <button type="button" className={secondary} disabled={disabled || !ready} onClick={() => void act(account.provider, "check")}>Verificar conexão</button>
          </>}
          <button type="button" className={secondary} disabled={disabled || !ready} onClick={() => void act(account.provider, "connect")}>
            {busy === `${account.provider}:connect` ? <Loader2 size={14} className="animate-spin"/> : <Link2 size={14}/>}{account.status !== "disconnected" ? "Reconectar ou trocar conta" : `Conectar ${name}`}
          </button>
          {account.status !== "disconnected" && <button type="button" className={`${secondary} text-red-700`} disabled={disabled} onClick={() => setDisconnecting(account.provider)}>Desconectar</button>}
        </div>
        {disconnecting === account.provider && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p>Desconectar, revogar a autorização e excluir os dados recebidos desta rede na ConnectyHub? Isso remove tokens, perfil e identificadores dos envios, interrompe entregas pendentes e mantém seus vídeos originais e o histórico. Um envio já recebido pela rede pode concluir; confira no próprio perfil. Vídeos publicados na rede não são apagados. Para voltar a usar a conta, será necessário reconectar.</p>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-[13px] text-white hover:bg-red-700 disabled:opacity-50" disabled={disabled} onClick={() => void act(account.provider, "disconnect")}>{busy === `${account.provider}:disconnect` ? "Desconectando…" : "Confirmar desconexão"}</button><button type="button" className={secondary} disabled={disabled} onClick={() => setDisconnecting(null)}>Cancelar</button></div>
        </div>}
        {shell === "admin" && !account.configured && <Link className="inline-block text-blue-700 underline" href="/admin/maintenance">Configurar o aplicativo na Sala de Manutenção</Link>}
      </AccountDialog>;
    })}
  </section>;
}

function providerStatus(account: SocialConnectionCard, ready: boolean): { tone: Tone; status: string } {
  if (account.status === "checking") return { tone: "attention", status: "Verificando" };
  if (account.status === "reconnect") return { tone: "attention", status: "Reconectar" };
  if (account.connected) return { tone: "ok", status: "Conectada" };
  return { tone: "idle", status: ready ? "Não conectada" : "Em preparação" };
}

function Marks({ brands, size }: { brands: SocialBrand[]; size: number }) {
  return <span className="flex items-center gap-1">{brands.map(b => <SocialBrandMark key={b} brand={b} size={size}/>)}</span>;
}

export function AccountTile({ brands, icon, name, tone, status, account, children }: { brands: SocialBrand[]; icon?: ReactNode; name: string; tone: Tone; status: string; account: string | null; children: ReactNode }) {
  return <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 sm:p-4">
    {icon ?? <Marks brands={brands} size={28}/>}
    <div className="min-w-0">
      <h2 className="text-[14px] font-semibold leading-5">{name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600"><span className={`h-2 w-2 shrink-0 rounded-full ${dot[tone]}`} aria-hidden="true"/>{status}</p>
      {account && <p className="mt-0.5 truncate text-[12px] text-slate-500" title={account}>{account}</p>}
    </div>
    <div className="mt-auto">{children}</div>
  </article>;
}

export function AccountDialog({ open, onClose, brands, icon, title, status, account, children, clientForm = false }: { icon?: ReactNode; clientForm?: boolean; open: boolean; onClose: () => void; brands: SocialBrand[]; title: string; status: string; account: string | null; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50"/>
      <Dialog.Content style={clientForm ? { ...panelTheme, background: "white" } : undefined} data-connecty-mode={clientForm ? "client" : undefined} className={`fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] ${clientForm ? "max-w-2xl ch-connection-dialog" : "max-w-lg"} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl`}>
        <div className="flex items-center gap-3 pr-8">
          {icon ?? <Marks brands={brands} size={32}/>}
          <div className="min-w-0">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="truncate text-sm text-slate-500">{account ? `${status} · ${account}` : status}</Dialog.Description>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">{children}</div>
        <Dialog.Close aria-label="Fechar" className="absolute right-4 top-4 rounded-lg p-1 hover:bg-slate-100"><X size={20}/></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
