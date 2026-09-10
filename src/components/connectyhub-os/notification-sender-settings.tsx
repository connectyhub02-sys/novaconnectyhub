"use client";
import { useEffect, useState } from "react";
import { chooseNotificationAgent, type NotificationAgent, type NotificationSenderPreference } from "@/lib/billing/notification-sender-policy";

type Settings = { preference: NotificationSenderPreference; agents: NotificationAgent[]; canManage: boolean; delivery: { enabled: boolean; hasPhone: boolean } };

export function NotificationSenderSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [choice, setChoice] = useState("automatic");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard/notification-sender", { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (controller.signal.aborted) return;
      setData(body);
      setChoice(body.preference.mode === "agent" ? body.preference.agent_id ?? "missing" : body.preference.mode);
      setNotice("");
    }).catch(error => { if (!controller.signal.aborted) setNotice(error.message || "Não foi possível carregar os avisos."); });
    return () => controller.abort();
  }, [revision]);
  async function save() {
    setBusy(true); setNotice("");
    const preference: NotificationSenderPreference = choice === "automatic" || choice === "platform" ? { mode: choice, agent_id: null } : { mode: "agent", agent_id: choice };
    try {
      const response = await fetch("/api/dashboard/notification-sender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: preference.mode, agentId: preference.agent_id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(current => current ? { ...current, preference } : current);
      setNotice("Remetente salvo. A escolha será usada nos próximos avisos.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const current = data ? chooseNotificationAgent(data.preference, data.agents) : null;
  async function toggleDelivery() {
    if (!data) return;
    const enabled = !data.delivery.enabled;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/dashboard/notification-sender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryEnabled: enabled }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(current => current ? { ...current, delivery: { ...current.delivery, enabled } } : current);
      setNotice(enabled ? "Avisos reativados para os próximos eventos. Mensagens antigas não serão reenviadas." : "Avisos desativados. Seu plano e seus agentes continuam iguais.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const missingChoice = data?.preference.mode === "agent" && !data.agents.some(agent => agent.id === data.preference.agent_id);
  return <section aria-labelledby="notification-sender-title" className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-6">
    <h2 id="notification-sender-title" className="text-lg font-semibold">Quem envia os avisos da sua conta?</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Receba no WhatsApp os avisos de cadastro, créditos, pagamentos e plano. Por padrão, um agente seu assume assim que estiver disponível. Antes disso, a ConnectyHub envia os avisos.</p>
    {notice && <p role="status" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {!data && !notice && <p className="mt-4 text-sm text-slate-500">Carregando preferências…</p>}
    {!data && notice && <button type="button" onClick={() => setRevision(value => value + 1)} className="mt-3 min-h-11 text-sm font-semibold text-blue-700">Tentar novamente</button>}
    {data && <>
      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold">Avisos automáticos por WhatsApp: {data.delivery.enabled ? "ativados" : "desativados"}</p>
        <p className="mt-1 text-sm text-slate-600">Inclui cadastro, créditos, planos e pagamentos. Essa escolha vale para os avisos pelo seu agente e pela ConnectyHub. Não altera seu plano nem os atendimentos aos seus clientes.</p>
        {data.canManage && data.delivery.hasPhone && <button type="button" disabled={busy} onClick={() => void toggleDelivery()} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-blue-700 disabled:opacity-50">{data.delivery.enabled ? "Desativar avisos" : "Voltar a receber avisos"}</button>}
        {!data.delivery.hasPhone && <p className="mt-2 text-sm text-slate-500">Cadastre o telefone do titular para receber os avisos.</p>}
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">Remetente da configuração salva: <strong>{current?.name ?? "WhatsApp da ConnectyHub"}</strong></p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="min-w-0 flex-1 text-sm font-medium">Remetente preferido
          <select aria-label="Remetente preferido" value={choice} disabled={busy || !data.canManage} onChange={event => setChoice(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
            <option value="automatic">Automático — usar um agente disponível</option>
            <option value="platform">Sempre pelo WhatsApp da ConnectyHub</option>
            {missingChoice && <option value={data.preference.agent_id ?? "missing"} disabled>Agente escolhido não está mais disponível</option>}
            {data.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.available ? "" : " — indisponível agora"}</option>)}
          </select>
        </label>
        {data.canManage && <button disabled={busy || choice === "missing"} className="min-h-11 shrink-0 rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar preferência"}</button>}
      </form>
      {!data.canManage && <p className="mt-3 text-xs text-slate-500">O titular da conta pode alterar essa escolha.</p>}
      {!data.agents.length && <p className="mt-3 text-sm text-slate-600">Ainda não tem agente ou usa apenas a API? Seus avisos continuam pelo WhatsApp da ConnectyHub.</p>}
    </>}
    <p className="mt-4 text-sm leading-6 text-slate-600">Se o agente escolhido ficar indisponível, a ConnectyHub assume. Esses avisos não consomem créditos e continuam mesmo com saldo zerado ou plano vencido. O saldo é único para todos os agentes e projetos da conta.</p>
  </section>;
}
