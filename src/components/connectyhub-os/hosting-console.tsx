"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Server, Link2, Plus } from "lucide-react";
import { DialogFrame } from "@/components/ui/dialog-frame";
import { hostingActionLabels, hostingStateLabels, type CustomerHosting, type HostingPreview, type HostingUsage } from "@/lib/infrastructure/hosting";
import { HostingUsageView } from "./hosting-usage";
export { HostingUsageView } from "./hosting-usage";
import { InfrastructureCustomerPicker } from "./infrastructure-customer-picker";

const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const field = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
type HostingData = { customerName: string | null; project: { organization_id: string | null; client_access_enabled: boolean; binding_revision: number }; usage: HostingUsage; broker: HostingPreview | null; canOperate: boolean };
type Customer = { id: string; name: string; owner: string; email: string };
export function HostingAdmin({ projectId }: { projectId: string }) {
  const [data, setData] = useState<HostingData | null>(null), [customers, setCustomers] = useState<Customer[]>([]);
  const [organization, setOrganization] = useState(""), [visible, setVisible] = useState(false), [editing, setEditing] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [action, setAction] = useState(""), [preview, setPreview] = useState<HostingPreview | null>(null), [confirmation, setConfirmation] = useState(""), [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0), [bindingRevision, setBindingRevision] = useState(0);
  const url = `/api/admin/infrastructure/${encodeURIComponent(projectId)}/hosting`;
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setData(b); setError(""); }
      catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Leitura indisponível."); setData(null); } }
      finally { if (!controller.signal.aborted) timer = setTimeout(read, 15000); }
    }; void read(); return () => { controller.abort(); clearTimeout(timer); };
  }, [url, revision]);
  async function edit() {
    if (!data) return; setBusy(true); setMessage("");
    try { const r = await fetch("/api/admin/infrastructure/customers", { cache: "no-store" }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setCustomers(b.customers); setOrganization(data.project.organization_id ?? ""); setVisible(data.project.client_access_enabled); setBindingRevision(data.project.binding_revision); setEditing(true); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Clientes indisponíveis."); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setMessage("");
    try { const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: organization || null, visible: !!organization && visible, revision: bindingRevision }) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setMessage(b.message); setEditing(false); setRevision(n => n + 1); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao salvar. Atualize para conferir o vínculo."); } finally { setBusy(false); }
  }
  async function execute() {
    if (!preview) return; setBusy(true); setMessage("");
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision: preview.revision, confirmation, reason, requestId: crypto.randomUUID() }) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setAction(""); setMessage("Operação recebida. Acompanhe o resultado abaixo antes de solicitar outra ação."); setRevision(n => n + 1); }
    catch (e) { setAction(""); setMessage(e instanceof Error ? e.message : "Resultado incerto. Atualize e confira o recibo antes de repetir."); setRevision(n => n + 1); } finally { setBusy(false); }
  }
  return <section className={`${panel} space-y-5`}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Cliente e hospedagem</h2><button className={button} disabled={!data || busy || projectId === "connectyhub"} onClick={edit}><Link2 size={16} className="mr-2 inline" />{data?.project.organization_id ? "Alterar vínculo / acesso" : "Vincular cliente"}</button></div>
    <p className="text-sm text-slate-600">Vínculo manual com o cliente cadastrado na ConnectyHub. O contrato continua em <Link href="/admin/contratos" className="text-blue-700 underline">Contratos personalizados</Link>. Vincular não cria cobrança nem provisiona serviços.</p>
    {data && <p className="text-sm">{data.project.organization_id ? `${data.customerName ?? "Cliente vinculado"} · visualização ${data.project.client_access_enabled ? "liberada" : "oculta"}` : "Nenhum cliente vinculado. Apenas o Admin visualiza este projeto."}</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {data && <HostingUsageView usage={data.usage} />}
    <div className="space-y-3 border-t border-slate-200 pt-4"><h3 className="font-semibold">Operação da hospedagem</h3><p className="text-sm text-slate-600">Pausar e colocar em quarentena interrompem os serviços e preservam os dados. A retomada é manual, inclusive após pagamento. Excluir remove os recursos locais apresentados na prévia.</p>
      {!data?.broker ? <p className="text-sm text-amber-800">Operação aguardando conferência dos recursos exclusivos deste projeto no servidor.</p> : <><p className="text-sm">Estado no servidor: <strong>{hostingStateLabels[data.broker.state] ?? data.broker.state}</strong></p>{data.broker.operation && <p className="break-all text-xs text-slate-600">Última operação: {hostingActionLabels[data.broker.operation.action]} · {data.broker.operation.status} · recibo {data.broker.operation.id}</p>}<div className="flex flex-wrap gap-2">{data.broker.actions.map(a => <button key={a} disabled={!data.canOperate || busy} className={`${button} ${a === "delete" ? "text-rose-700" : ""}`} onClick={() => { setAction(a); setPreview(data.broker); setConfirmation(""); setReason(""); setMessage(""); }}>{hostingActionLabels[a]}</button>)}</div>{!data.canOperate && <p className="text-xs text-amber-800">Comandos exigem permissão de administrador de infraestrutura.</p>}</>}
    </div>
    {editing && <DialogFrame onClose={() => !busy && setEditing(false)} aria-labelledby="hosting-binding-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 text-slate-900"><h2 id="hosting-binding-title" className="text-xl font-bold">Vincular {projectId} a um cliente</h2><InfrastructureCustomerPicker customers={customers} value={organization} onChange={setOrganization} currentName={data?.customerName} disabled={busy} /><label className="flex items-start gap-3 text-sm"><input type="checkbox" disabled={!organization} checked={!!organization && visible} onChange={e => setVisible(e.target.checked)} className="mt-1" /><span>Liberar “Minha infraestrutura” no painel desse cliente, somente para os serviços deste projeto.</span></label><p className="text-xs text-slate-500">Ao trocar o cliente ou retirar a liberação, o cliente anterior perde a visualização na próxima consulta.</p><Link href="/admin/clientes" className="block text-sm text-blue-700 underline">Cadastrar cliente na ConnectyHub</Link>{message && <p role="status" className="text-sm">{message}</p>}<div className="flex justify-end gap-3"><button className={button} disabled={busy} onClick={() => setEditing(false)}>Cancelar</button><button className={`${button} bg-blue-700 text-white`} disabled={busy} onClick={save}>Salvar vínculo</button></div></div></DialogFrame>}
    {action && preview && <DialogFrame onClose={() => !busy && setAction("")} aria-labelledby="hosting-action-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-auto rounded-2xl bg-white p-6 text-slate-900"><h2 id="hosting-action-title" className="text-xl font-bold">{hostingActionLabels[action]} · {projectId}</h2><p className="text-sm">{action === "delete" ? "Exclusão irreversível dos recursos locais abaixo. Só é liberada após quarentena. O cadastro do cliente, o contrato e os registros de auditoria são preservados." : action === "resume" ? "Retoma os serviços que estavam ligados antes da pausa. A saúde será conferida separadamente após a inicialização." : "O site, painel, banco e automações deste projeto deixarão de funcionar. Os dados serão preservados."}</p><details open className="rounded-xl bg-slate-50 p-3"><summary className="font-semibold">{preview.services.length} serviços na prévia</summary><ul className="mt-2 space-y-1 text-xs">{preview.services.map(s => <li className="break-all" key={s.name}>{s.name} · {s.running ? "ligado" : "parado"}</li>)}</ul>{action === "delete" && <><p className="mt-3 text-xs font-bold">Volumes e diretórios exclusivos</p><ul className="text-xs">{[...preview.volumes, ...preview.directories].map(v => <li className="break-all" key={v}>{v}</li>)}</ul></>}</details>{preview.exclusions.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-sm"><strong>Fora desta operação</strong><ul className="mt-2 list-disc pl-5">{preview.exclusions.map(v => <li key={v}>{v}</li>)}</ul></div>}<label className="block space-y-2 text-sm"><span>Motivo</span><input className={field} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /></label><label className="block space-y-2 text-sm"><span>Digite <strong>{projectId}:{action}</strong> para confirmar</span><input className={field} value={confirmation} autoComplete="off" onChange={e => setConfirmation(e.target.value)} /></label><div className="flex justify-end gap-3"><button className={button} disabled={busy} onClick={() => setAction("")}>Cancelar</button><button className={`${button} bg-slate-900 text-white`} disabled={busy || reason.trim().length < 5 || confirmation !== `${projectId}:${action}`} onClick={execute}>{busy ? "Solicitando…" : "Confirmar operação"}</button></div></div></DialogFrame>}
  </section>;
}

export function RegisterInfrastructure() {
  const router = useRouter();
  const [open, setOpen] = useState(false), [name, setName] = useState(""), [id, setId] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function save() { setBusy(true); setError(""); try { const r = await fetch("/api/admin/infrastructure/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); router.push(`/admin/infrastructure/${encodeURIComponent(b.id)}`); } catch (e) { setError(e instanceof Error ? e.message : "Falha ao cadastrar."); } finally { setBusy(false); } }
  return <div className={panel}><button className={button} onClick={() => setOpen(!open)}><Plus size={16} className="mr-2 inline" />Cadastrar infraestrutura</button>{open && <div className="mt-4 max-w-xl space-y-3"><p className="text-sm text-slate-600">Cadastre o projeto e depois vincule o cliente. Os serviços na VPS precisam ser configurados e conferidos; este cadastro não contrata nem cria servidores.</p><label className="block text-sm">Nome<input className={field} value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label><label className="block text-sm">Identificador (ex.: minha-empresa)<input className={field} value={id} maxLength={64} onChange={e => setId(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy || name.trim().length < 2 || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)} className={button} onClick={save}>Criar cadastro</button></div>}</div>;
}

export function CustomerInfrastructure() {
  const [projects, setProjects] = useState<CustomerHosting[] | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const read = async () => { try { const r = await fetch("/api/dashboard/infrastructure", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setProjects(b.projects); setError(""); } catch (e) { if (!controller.signal.aborted) { setProjects(null); setError(e instanceof Error ? e.message : "Consulta indisponível."); } } finally { if (!controller.signal.aborted) timer = setTimeout(read, 15000); } }; void read(); return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return <main className="space-y-6"><div><h1 className="flex items-center gap-3 text-2xl font-bold"><Server />Minha infraestrutura</h1><p className="mt-2 text-sm text-slate-600">Serviços vinculados à sua empresa e liberados pela equipe ConnectyHub.</p></div>{error && <p role="alert" className={`${panel} text-rose-700`}>{error}</p>}{!projects && !error && <p>Carregando infraestrutura…</p>}{projects?.length === 0 && <p className={panel}>Nenhuma infraestrutura liberada para sua conta. O vínculo é feito pela equipe ConnectyHub após o acordo de serviço.</p>}{projects?.map(p => <section key={p.id} className={`${panel} space-y-4`}><div><p className="text-xs text-slate-500">{p.company}</p><h2 className="text-xl font-bold">{p.name}</h2></div><HostingUsageView usage={p.usage} /></section>)}</main>;
}
