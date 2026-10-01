"use client";

import { useEffect, useState } from "react";
import { planFeatureDefinitions } from "@/lib/billing/plan-entitlements";
import { developmentScopeFields, maxDevelopmentAdditionalFields, parseContractDevelopmentScope } from "@/lib/billing/contract-development";
import type { CustomContract } from "@/lib/billing/custom-contracts";
import { ContractDevelopmentSummary } from "./contract-development-summary";

const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900";
const limits = [["agent_limit", "Agentes"], ["whatsapp_instance_limit", "WhatsApps"], ["user_limit", "Usuários"], ["organization_limit", "Empresas"], ["storage_limit_bytes", "Armazenamento (bytes)"], ["storage_file_limit", "Arquivos"]] as const;

export function CustomContractEditor({ organizations, initialOrganizationId }: {
  organizations: Array<{ id: string; name: string }>;
  initialOrganizationId?: string;
}) {
  const [org, setOrg] = useState(initialOrganizationId ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-5xl space-y-6 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold">Contratos personalizados</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Combine os recursos da ConnectyHub com o desenvolvimento de plataformas e os serviços acordados com cada cliente. Alterações não reescrevem faturas emitidas nem concedem créditos por edição.</p>
      </div>
      <div className="text-sm font-semibold">
        <label htmlFor="custom-contract-client">Cliente</label>
        <select id="custom-contract-client" value={org} disabled={busy} onChange={event => setOrg(event.target.value)} className={field}>
          <option value="">Selecione a conta de cobrança</option>
          {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {org && <AccountContracts key={org} organizationId={org} onBusyChange={setBusy} />}
    </div>
  );
}

function AccountContracts({ organizationId, onBusyChange }: { organizationId: string; onBusyChange: (busy: boolean) => void }) {
  const [contracts, setContracts] = useState<CustomContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [template, setTemplate] = useState<CustomContract | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/custom-contracts?organizationId=${encodeURIComponent(organizationId)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error ?? "Não foi possível carregar os contratos.");
        if (!controller.signal.aborted) setContracts(data.contracts ?? []);
      })
      .catch(error => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Não foi possível carregar os contratos."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId]);

  async function save(data: Record<string, unknown>) {
    setBusy(true);
    onBusyChange(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/custom-contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, organizationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar.");
      setContracts(current => [result.contract, ...current]);
      setNotice("Condições salvas. O escopo ficará disponível ao cliente nas condições individuais. A nova versão será usada nas próximas faturas elegíveis; o pagamento ativa os recursos e créditos.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <>
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
    <ContractForm key={revision} template={template} busy={busy || loading} onSave={save} />
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Histórico de condições</h2>
      {loading ? <p role="status" className="text-sm text-slate-500">Carregando condições…</p> : contracts.length === 0 ? <p className="text-sm text-slate-500">Nenhuma versão carregada para este cliente.</p> : null}
      {contracts.map(contract => <article key={contract.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">{contract.name} · versão {contract.version}</h3>
        <p className="text-sm">{Number(contract.monthly_price_brl).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês · {Number(contract.included_credits).toLocaleString("pt-BR")} créditos · base {contract.base_plan_code}</p>
        <p className="text-xs text-slate-500">Vigência: {new Date(contract.effective_at).toLocaleString("pt-BR")}. Este registro não confirma pagamento ou ativação.</p>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Ver escopo, recursos e limites desta versão</summary>
          <div className="mt-3 space-y-4">
            <ContractDevelopmentSummary scope={contract.development_scope} title="Desenvolvimento previsto nesta versão" />
            {!contract.development_scope && <p className="text-sm text-slate-500">Sem desenvolvimento descrito nesta versão.</p>}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {Object.values(planFeatureDefinitions).map(item => <div key={item.code}><dt className="font-medium">{item.name}</dt><dd>{contract.features[item.code] === undefined ? "Herdado do plano-base" : contract.features[item.code] ? "Liberado" : "Bloqueado"}</dd></div>)}
              {limits.map(([key, label]) => <div key={key}><dt className="font-medium">{label}</dt><dd>{contract.resource_limits[key] === undefined ? "Herdado do plano-base" : contract.resource_limits[key].toLocaleString("pt-BR")}</dd></div>)}
            </dl>
          </div>
        </details>
        <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-blue-200 px-4 text-sm font-semibold text-blue-800 disabled:opacity-50" onClick={() => { setTemplate(contract); setRevision(value => value + 1); setNotice(`Versão ${contract.version} copiada para o formulário. Revise o escopo e informe as novas datas antes de salvar.`); }}>Usar como base de uma nova versão</button>
      </article>)}
    </section>
  </>;
}

function ContractForm({ template, busy, onSave }: { template: CustomContract | null; busy: boolean; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [development, setDevelopment] = useState(Boolean(template?.development_scope));
  const [additional, setAdditional] = useState(() => (template?.development_scope?.additional_fields ?? []).map((item, index) => ({ ...item, id: String(index) })));
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const features: Record<string, boolean> = {};
      const resource_limits: Record<string, number> = {};
      for (const key of Object.keys(planFeatureDefinitions)) {
        const value = data.get(`feature:${key}`);
        if (value === "true" || value === "false") features[key] = value === "true";
      }
      for (const [key] of limits) {
        const value = data.get(key);
        if (value !== null && value !== "") resource_limits[key] = Number(value);
      }
      const development_scope = parseContractDevelopmentScope(development ? {
        ...Object.fromEntries(developmentScopeFields.map(item => [item.key, data.get(`development:${item.key}`)])),
        additional_fields: additional.map(item => ({ label: data.get(`additional:${item.id}:label`), value: data.get(`additional:${item.id}:value`) })),
      } : null);
      await onSave({ name: data.get("name"), base_plan_code: data.get("base_plan_code"), monthly_price_brl: data.get("monthly_price_brl"), included_credits: data.get("included_credits"), effective_at: new Date(String(data.get("effective_at"))).toISOString(), first_period_end: new Date(String(data.get("first_period_end"))).toISOString(), features, resource_limits, development_scope });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Confira os campos do contrato."); }
  }

  return <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-bold">Nova versão das condições</h2>
    {template && <p className="text-sm text-blue-800">Preenchida a partir da versão {template.version}. Ao salvar, será criada uma nova versão.</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Nome do contrato<input required name="name" maxLength={120} defaultValue={template?.name} placeholder="Plataforma e operação da empresa" className={field} /></label>
        <label className="text-sm">Plano-base para herdar recursos<select name="base_plan_code" defaultValue={template?.base_plan_code ?? "scale"} className={field}><option value="starter">Start</option><option value="pro">Pro</option><option value="scale">Scale</option></select></label>
        <label className="text-sm">Mensalidade total do contrato (R$)<input name="monthly_price_brl" required type="number" min="0.01" max="1000000" step="0.01" defaultValue={template?.monthly_price_brl} className={field} /></label>
        <label className="text-sm">Créditos por mês<input name="included_credits" required type="number" min={0} max={1e9} step="1" defaultValue={template?.included_credits} className={field} /></label>
        <label className="text-sm">Início de vigência<input required type="datetime-local" name="effective_at" className={field} /></label>
        <label className="text-sm">Próximo vencimento na contratação inicial<input required type="datetime-local" name="first_period_end" className={field} /></label>
      </div>
      <p className="text-xs leading-5 text-slate-500">Horários no fuso do seu dispositivo. Em renovações, o período corrente é preservado e o novo ciclo dura um mês. A mensalidade é o valor total negociado; descrever serviços não acrescenta cobranças.</p>
      <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={development} onChange={event => setDevelopment(event.target.checked)} className="size-4" />Este contrato inclui desenvolvimento de plataforma ou serviços sob medida</label>
        <p className="text-xs leading-5 text-slate-600">Descreva o que o cliente está contratando além dos recursos da ConnectyHub. Todos os campos desta seção ficam visíveis para ele.</p>
        <fieldset hidden={!development} disabled={!development} className="min-w-0 space-y-4">
          {developmentScopeFields.map(item => <label key={item.key} className="block text-sm font-medium">{item.label}{item.required ? " *" : " (opcional)"}
            {item.key === "project_name" ? <input name={`development:${item.key}`} required={item.required} maxLength={item.maxLength} defaultValue={template?.development_scope?.[item.key]} placeholder="Nome da plataforma ou do projeto" className={field} /> : <textarea name={`development:${item.key}`} required={item.required} maxLength={item.maxLength} defaultValue={template?.development_scope?.[item.key]} rows={item.key === "description" ? 4 : 3} className={`${field} py-3`} />}
          </label>)}
          <p className="text-xs leading-5 text-slate-500">Registre entregas e condições acordadas. O escopo serve de referência para acompanhamento e relatórios; não marca tarefas como concluídas.</p>
          {additional.map((item, index) => <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <label className="block text-sm">Nome do campo adicional {index + 1}<input name={`additional:${item.id}:label`} required maxLength={100} defaultValue={item.label} placeholder="Ex.: Integrações previstas, prazo ou critérios de aceite" className={field} /></label>
            <label className="block text-sm">Descrição do campo adicional {index + 1}<textarea name={`additional:${item.id}:value`} required maxLength={2000} defaultValue={item.value} rows={3} className={`${field} py-3`} /></label>
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-red-700" onClick={() => setAdditional(current => current.filter(entry => entry.id !== item.id))}>Remover campo {index + 1}</button>
          </div>)}
          <button type="button" disabled={additional.length >= maxDevelopmentAdditionalFields} className="min-h-11 rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-800 disabled:opacity-50" onClick={() => setAdditional(current => [...current, { id: crypto.randomUUID(), label: "", value: "" }])}>Adicionar campo ao projeto</button>
        </fieldset>
      </section>
      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-semibold">Recursos e limites da ConnectyHub</summary>
        <p className="mt-3 text-xs leading-5 text-slate-600">Mantenha “Plano base” para herdar o recurso. Os limites preenchidos são totais, não adicionais; zero impede novas criações. IA usa os créditos contratados; a API WhatsApp possui permissão própria.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.values(planFeatureDefinitions).map(item => <label key={item.code} className="text-sm">{item.name}<select name={`feature:${item.code}`} defaultValue={template?.features[item.code] === undefined ? "" : String(template.features[item.code])} className={field}><option value="">Plano base</option><option value="true">Liberado</option><option value="false">Bloqueado</option></select></label>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{limits.map(([key, label]) => <label className="text-sm" key={key}>{label}<input name={key} type="number" min={0} step={1} defaultValue={template?.resource_limits[key]} placeholder="Limite do plano base" className={field} /></label>)}</div>
      </details>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "Aguarde…" : "Salvar condições individuais"}</button>
    </fieldset>
  </form>;
}
