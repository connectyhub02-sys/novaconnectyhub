'use client';

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brazilianDate, type CostCenterMonth } from "@/lib/billing/cost-center-report";
import type { AgentOptimizationAdmin, CostCenterMonthResult } from "@/lib/billing/cost-center-month";
import { NeonBadge, Panel } from "./panel-primitives";

const brl = (value: number | null, digits = 2) =>
  value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (value: number) => `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (value: number | null) => (value === null ? "—" : Math.round(value).toLocaleString("pt-BR"));
const credits = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cr`;
const times = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`);
const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function Value({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-[17px] font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : ""}`} style={tone ? undefined : { color: "var(--ch-text)" }}>{value}</p>
      {detail && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{detail}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

export function CostCenterMonthPanel({ result }: { result: CostCenterMonthResult }) {
  const month = result.ok ? result.data.month : result.month;
  const nav = (
    <div className="flex flex-wrap items-center gap-2">
      <Link className="rounded-lg border px-2 py-1 text-[12px]" style={{ borderColor: "var(--ch-border)" }} href={`?month=${shiftMonth(month, -1)}`} aria-label="Mês anterior">←</Link>
      <NeonBadge tone="cyan">{monthLabel(month)}</NeonBadge>
      <Link className="rounded-lg border px-2 py-1 text-[12px]" style={{ borderColor: "var(--ch-border)" }} href={`?month=${shiftMonth(month, 1)}`} aria-label="Próximo mês">→</Link>
    </div>
  );

  return (
    <Panel className="mb-4" title="Resultado do mês" eyebrow="custo real / cobrado / caixa" compact action={nav}>
      {result.ok ? <MonthBody data={result.data} /> : <p className="text-[13px] text-amber-700">{result.error}</p>}
    </Panel>
  );
}

function MonthBody({ data }: { data: CostCenterMonth }) {
  const { attendance, charged, voice } = data;
  return (
    <div>
      {data.missingRates.length > 0 && (
        <p className="mb-3 rounded-lg px-3 py-2 text-[12px] text-amber-800" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)" }}>
          Uso sem tarifa neste mês (não cobrado, aguardando preço): {data.missingRates.map(item => `${item.featureCode}${item.modelId ? ` (${item.modelId})` : ""} × ${item.events}`).join(", ")}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Value label="Dinheiro recebido" value={brl(data.cash.receivedBrl)} detail={`${int(data.cash.invoicesPaid)} fatura(s) paga(s)`} />
        <Value label="Custo de IA" value={brl(data.variable.costBrl)} detail={`${usd(data.variable.costUsd)} a ${brl(data.fxUsdBrl)}`} />
        <Value label="Custos fixos" value={brl(data.fixed.totalBrl)} detail="VPS, WhatsApp e assinatura de voz" />
        <Value label="Resultado do mês" value={brl(data.result.cashResultBrl)} detail="recebido − IA − fixos (sem impostos)" tone={data.result.cashResultBrl >= 0 ? "good" : "bad"} />
      </div>

      <Section title="Consumo cobrado dos clientes">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Value label="Créditos cobrados" value={credits(charged.customerCredits)} detail={`${brl(charged.customerChargedBrl)} a R$ 0,01`} />
          <Value label="Custo desse consumo" value={brl(charged.customerCostBrl)} detail={`${brl(charged.costPerCreditBrl, 4)} por crédito`} />
          <Value label="Margem do consumo" value={brl(charged.marginBrl)} detail={`meta ${data.targetMarkup}x`} tone={charged.marginBrl >= 0 ? "good" : "bad"} />
          <Value label="Multiplicador real" value={times(charged.multiplier)} detail="cobrado ÷ custo" tone={charged.multiplier !== null && charged.multiplier >= data.targetMarkup ? "good" : "bad"} />
        </div>
      </Section>

      <Section title="Atendimento no WhatsApp, por resposta">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Value label="Respostas cobradas" value={int(attendance.replies)} detail={`≈ ${int(attendance.avgInputTokensPerReply)} tokens de entrada cada`} />
          <Value label="Custo por resposta" value={brl(attendance.costPerReplyBrl, 3)} detail="resposta + análises e memórias" />
          <Value label="Preço por resposta" value={brl(attendance.pricePerReplyBrl)} detail={`${attendance.creditsPerReply ?? "—"} créditos`} />
          <Value label="1.000 créditos rendem" value={`${int(attendance.repliesPer1000Credits)} respostas`} detail={`prompt reaproveitado no cache: ${percent(attendance.cachedShare)}`} />
        </div>
      </Section>

      <Section title="Voz ElevenLabs">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Value label="Caracteres no mês" value={int(voice.characters)} detail={voice.quotaUnits ? `${percent(voice.quotaShare)} da franquia` : "franquia não cadastrada"} />
          <Value label="Cobrado em voz" value={brl(voice.chargedBrl)} />
          <Value label="Assinatura" value={brl(voice.subscriptionBrl)} detail={`tabela por caractere: ${brl(voice.tableCostBrl)}`} />
          <Value label="Resultado da voz" value={brl(voice.resultBrl)} tone={voice.resultBrl >= 0 ? "good" : "bad"} />
        </div>
      </Section>

      {data.promptOrders.length > 0 && (
        <Section title="Prompt: ordem atual × organizado para cache">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1">Ordem</th><th className="py-1 text-right">Respostas</th><th className="py-1 text-right">Cache</th><th className="py-1 text-right">Créditos/resp.</th><th className="py-1 text-right">Humanidade</th>
              </tr>
            </thead>
            <tbody>
              {data.promptOrders.map(row => (
                <tr key={row.order} className="border-t" style={{ borderColor: "var(--ch-border)" }}>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right font-mono">{int(row.replies)}</td>
                  <td className="py-1.5 text-right font-mono">{percent(row.cachedShare)}</td>
                  <td className="py-1.5 text-right font-mono">{row.creditsPerReply ?? "—"}</td>
                  <td className="py-1.5 text-right font-mono">{row.avgHumanityScore === null ? "—" : `${row.avgHumanityScore} (${row.scoredReplies})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-500">Humanidade: média do benchmark (0–100) nas respostas avaliadas; só agentes com o benchmark ligado.</p>
        </Section>
      )}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <Section title="Custo de IA por modo">
          <GroupTable rows={data.variable.byMode} />
        </Section>
        <Section title="Maiores custos dos clientes">
          <GroupTable rows={data.variable.byFeature} />
        </Section>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <Section title="Créditos no mês">
          <table className="w-full text-[12px]">
            <tbody>
              {data.credits.flow.map(row => (
                <tr key={row.origin} className="border-t" style={{ borderColor: "var(--ch-border)" }}>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right font-mono">{credits(row.credits)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold" style={{ borderColor: "var(--ch-border)" }}>
                <td className="py-1.5">Saldo hoje nas carteiras</td>
                <td className="py-1.5 text-right font-mono">{credits(data.credits.walletBalance)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-500">Se todo o saldo for usado, custará cerca de {brl(data.credits.liabilityCostBrl)}.</p>
        </Section>
        <Section title="Cotação e custos fixos">
          <FxForm rate={data.fxUsdBrl} asOf={data.fxAsOf} />
          <div className="mt-2 space-y-2">
            {data.fixed.items.map(item => <FixedCostForm key={item.cost_key} item={item} />)}
          </div>
        </Section>
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-[11px] leading-5 text-slate-500">
        {data.notes.map(note => <li key={note}>{note}</li>)}
      </ul>
    </div>
  );
}

function GroupTable({ rows }: { rows: CostCenterMonth["variable"]["byMode"] }) {
  if (!rows.length) return <p className="text-[12px] text-slate-500">Sem consumo no mês.</p>;
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
          <th className="py-1">Item</th><th className="py-1 text-right">Custo</th><th className="py-1 text-right">Cobrado</th><th className="py-1 text-right">Mult.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key} className="border-t" style={{ borderColor: "var(--ch-border)" }}>
            <td className="py-1.5">{row.label}</td>
            <td className="py-1.5 text-right font-mono">{brl(row.costBrl)}</td>
            <td className="py-1.5 text-right font-mono">{brl(row.chargedBrl)}</td>
            <td className="py-1.5 text-right font-mono">{times(row.multiplier)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useSave() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: "", error: false });
  async function save(body: unknown) {
    setState({ busy: true, message: "", error: false });
    const response = await fetch("/api/admin/billing/cost-center", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = await response?.json().catch(() => null) as { error?: string } | null;
    if (!response?.ok) return setState({ busy: false, message: payload?.error ?? "Não foi possível salvar.", error: true });
    setState({ busy: false, message: "Salvo.", error: false });
    router.refresh();
  }
  return { state, save };
}

function FxForm({ rate, asOf }: { rate: number; asOf: string | null }) {
  const [value, setValue] = useState(String(rate).replace(".", ","));
  const { state, save } = useSave();
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event: FormEvent) => { event.preventDefault(); void save({ fx: { rate: value } }); }}>
      <label className="text-[12px]">
        <span className="block text-[11px] text-slate-500">Dólar em reais{asOf ? ` (desde ${brazilianDate(asOf)})` : ""}</span>
        <input className="mt-1 w-24 rounded-md border px-2 py-1" style={{ borderColor: "var(--ch-border)" }} inputMode="decimal" value={value} onChange={event => setValue(event.target.value)} />
      </label>
      <button className="rounded-md bg-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" disabled={state.busy}>Salvar</button>
      {state.message && <span className={`text-[11px] ${state.error ? "text-rose-600" : "text-emerald-600"}`}>{state.message}</span>}
    </form>
  );
}

function FixedCostForm({ item }: { item: CostCenterMonth["fixed"]["items"][number] }) {
  const [amount, setAmount] = useState(String(item.monthly_amount).replace(".", ","));
  const [quota, setQuota] = useState(item.quota_units ? String(item.quota_units) : "");
  const { state, save } = useSave();
  return (
    <form
      className="rounded-lg px-3 py-2"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
      onSubmit={(event: FormEvent) => { event.preventDefault(); void save({ fixedCost: { costKey: item.cost_key, monthlyAmount: amount, currency: item.currency, quotaUnits: item.quota_unit ? quota : null } }); }}
    >
      <p className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{item.name}</p>
      <p className="text-[11px] text-slate-500">
        {brl(item.monthlyBrl)} por mês
        {item.perUnitBrl !== null ? ` · ${brl(item.perUnitBrl)} por instância · ${int(item.usedUnits)} de ${int(item.capacity_units)} em uso` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        <label className="text-[12px]">
          <span className="block text-[11px] text-slate-500">Valor mensal ({item.currency === "USD" ? "US$" : "R$"})</span>
          <input className="mt-1 w-24 rounded-md border px-2 py-1" style={{ borderColor: "var(--ch-border)" }} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
        </label>
        {item.quota_unit && (
          <label className="text-[12px]">
            <span className="block text-[11px] text-slate-500">Franquia mensal (caracteres)</span>
            <input className="mt-1 w-32 rounded-md border px-2 py-1" style={{ borderColor: "var(--ch-border)" }} inputMode="numeric" placeholder="a confirmar" value={quota} onChange={event => setQuota(event.target.value.replace(/\D/g, ""))} />
          </label>
        )}
        <button className="rounded-md bg-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" disabled={state.busy}>Salvar</button>
        {state.message && <span className={`text-[11px] ${state.error ? "text-rose-600" : "text-emerald-600"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function AgentOptimizationPanel({ data }: { data: AgentOptimizationAdmin }) {
  const [scope, setScope] = useState(data.settings.cacheFriendlyPrompt);
  const [pilot, setPilot] = useState<string[]>(data.settings.pilotAgentIds);
  const { state, save } = useSave();
  const toggle = (id: string) => setPilot(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const options: Array<{ value: typeof scope; label: string; detail: string }> = [
    { value: "off", label: "Desligado", detail: "ordem atual do prompt" },
    { value: "pilot", label: "Piloto", detail: "só os agentes marcados" },
    { value: "all", label: "Todos", detail: "todos os agentes" },
  ];
  return (
    <Panel className="mb-4" title="Otimizações do agente" eyebrow="custo por resposta / qualidade" compact collapsible defaultOpen>
      <div className="space-y-3 text-[12px]">
        <p className="leading-5 text-slate-600">
          <strong>Raciocínio baixo nas tarefas auxiliares:</strong> sempre ativo. Corrige memórias, análises e detecções que eram cortadas
          antes de responder e reduz o custo dessas tarefas.
        </p>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); void save({ optimizations: { cacheFriendlyPrompt: scope, pilotAgentIds: pilot } }); }}>
          <p className="font-semibold" style={{ color: "var(--ch-text)" }}>Prompt organizado para cache</p>
          <p className="mb-2 leading-5 text-slate-500">
            Mesmo texto, com as partes fixas primeiro. A parte repetida passa a custar 10% do preço no Gemini. Compare o cache e o
            benchmark de humanidade dos agentes do piloto antes de ligar para todos.
          </p>
          <div className="flex flex-wrap gap-2">
            {options.map(option => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: scope === option.value ? "rgb(8,145,178)" : "var(--ch-border)" }}>
                <input type="radio" name="cache-scope" checked={scope === option.value} onChange={() => setScope(option.value)} />
                <span><span className="font-semibold">{option.label}</span> <span className="text-slate-500">· {option.detail}</span></span>
              </label>
            ))}
          </div>
          {scope === "pilot" && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border p-2" style={{ borderColor: "var(--ch-border)" }}>
              {data.agents.map(agent => (
                <label key={agent.id} className="flex cursor-pointer items-center gap-2 py-1">
                  <input type="checkbox" checked={pilot.includes(agent.id)} onChange={() => toggle(agent.id)} />
                  <span>{agent.name} <span className="text-slate-500">· {agent.organization}</span></span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button className="rounded-md bg-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" disabled={state.busy || (scope === "pilot" && !pilot.length)}>Salvar</button>
            {state.message && <span className={`text-[11px] ${state.error ? "text-rose-600" : "text-emerald-600"}`}>{state.message}</span>}
          </div>
        </form>
      </div>
    </Panel>
  );
}
