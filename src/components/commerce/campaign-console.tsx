"use client";
import { AnnouncementPlanner } from "./announcement-planner";
import {
  SubscriptionConsole,
  type StoreContract,
} from "./subscription-console";
import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Tag,
  CalendarDays,
  ArrowRight,
  Save,
} from "lucide-react";
import {
  campaignIntervals,
  intervalLabels,
  quoteCampaign,
  parseCampaign,
  type CampaignConfig,
  type CampaignInterval,
} from "@/lib/commerce/campaigns";

type Row = { id: string; revision: number; configuration: CampaignConfig };
type Target = {
  id: string;
  name: string;
  price: number;
  recurring: boolean;
  interval: string;
};
const blank = (): CampaignConfig => ({
  name: "",
  description: "",
  status: "draft",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  targetIds: [],
  originIds: [],
  audience: "all",
  buyerIds: [],
  operations: ["initial"],
  stages: [{ cycles: 1, kind: "percent", value: 10 }],
  options: [
    { id: "month", interval: "month", price: 100, permanentDiscount: 0 },
  ],
  maxUses: 1,
  message: "",
});
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateInput = (v: string) => {
  const date = new Date(v);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(" ", "T");
};
const field =
  "w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-600 focus:outline-none";
const label = "grid gap-1.5 text-xs font-semibold text-slate-600";
const operationLabels = {
  initial: "Contratação / compra",
  renewal: "Renovação",
  reactivation: "Reativação",
  upgrade: "Upgrade",
};
export function CampaignConsole({ owner }: { owner: "platform" | "store" }) {
  const endpoint =
    owner === "platform"
      ? "/api/admin/commercial-campaigns"
      : "/api/dashboard/commercial-campaigns";
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [contracts, setContracts] = useState<StoreContract[]>([]);
  const [rows, setRows] = useState<Row[]>([]),
    [targets, setTargets] = useState<Target[]>([]),
    [buyers, setBuyers] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Row | null>(null),
    [config, setConfig] = useState<CampaignConfig>(blank),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    fetch(endpoint)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (live) {
          setChannels(d.channels ?? []);
          setContracts(d.contracts ?? []);
          setRows(d.campaigns);
          setTargets(d.targets);
          setBuyers(d.buyers);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [endpoint]);
  const update = (patch: Partial<CampaignConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setNotice("");
  };
  async function save() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const validated = parseCampaign(config);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id,
          revision: editing?.revision,
          configuration: validated,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditing(data.campaign);
      setConfig(data.campaign.configuration);
      setRows((old) => [
        data.campaign,
        ...old.filter((r) => r.id !== data.campaign.id),
      ]);
      setNotice(
        config.status === "active"
          ? "Campanha publicada. Nenhuma mensagem foi disparada."
          : "Campanha salva.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function cancelSubscription(id: string) {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_subscription",
          agreementId: id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setContracts((old) =>
        old.map((c) =>
          c.id === id
            ? { ...c, cancel_at_period_end: true, state: "cancelled" }
            : c,
        ),
      );
      setNotice(d.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  }
  const totalCycles = config.stages.reduce((n, s) => n + Number(s.cycles), 0);
  const toggleTarget = (id: string) =>
    update({
      targetIds: config.targetIds.includes(id)
        ? config.targetIds.filter((v) => v !== id)
        : [...config.targetIds, id],
    });
  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Vendas e relacionamento
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            Campanhas e benefícios
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Ofertas para novos clientes, reativação e upgrades. Defina o prazo
            para aderir e por quanto tempo o benefício continua.
          </p>
        </div>
        <button
          className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white"
          onClick={() => {
            setEditing(null);
            setConfig(blank());
            setError("");
            setNotice("");
          }}
        >
          <Plus size={16} />
          Nova campanha
        </button>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {rows.map((row) => (
            <button
              key={row.id}
              onClick={() => {
                setEditing(row);
                setConfig(row.configuration);
                setError("");
                setNotice("");
              }}
              className={`w-full rounded-xl border p-4 text-left ${editing?.id === row.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}
            >
              <span className="block text-sm font-bold text-slate-950">
                {row.configuration.name}
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                {
                  { active: "Publicada", draft: "Rascunho", paused: "Pausada" }[
                    row.configuration.status
                  ]
                }{" "}
                · versão {row.revision}
              </span>
            </button>
          ))}
          {!rows.length && !busy ? (
            <p className="p-3 text-sm text-slate-600">
              Crie sua primeira campanha.
            </p>
          ) : null}
        </aside>
        <div className="min-w-0 space-y-6 rounded-2xl bg-white p-4 text-slate-950 shadow-lg sm:p-6">
          <div className="flex items-center gap-2">
            <Tag size={20} className="text-emerald-700" />
            <h2 className="text-lg font-bold">
              {editing ? "Editar campanha" : "Nova campanha"}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Nome da campanha
              <input
                className={field}
                maxLength={100}
                value={config.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Setembro de ofertas"
              />
            </label>
            <label className={label}>
              Situação
              <select
                className={field}
                value={config.status}
                onChange={(e) =>
                  update({ status: e.target.value as CampaignConfig["status"] })
                }
              >
                <option value="draft">Rascunho</option>
                <option value="active">Publicada</option>
                <option value="paused">Pausada</option>
              </select>
            </label>
          </div>
          <label className={label}>
            Descrição para o cliente
            <input
              className={field}
              value={config.description}
              maxLength={500}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Condições especiais para começar agora"
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="mb-3 flex items-center gap-2 font-bold">
              <CalendarDays size={18} />
              Prazo para aderir
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["startsAt", "endsAt"] as const).map((key, i) => (
                <label key={key} className={label}>
                  {i ? "Até" : "A partir de"} — horário de Brasília
                  <input
                    type="datetime-local"
                    className={field}
                    value={dateInput(config[key])}
                    onChange={(e) => {
                      if (e.target.value)
                        update({
                          [key]: new Date(
                            e.target.value + ":00-03:00",
                          ).toISOString(),
                        });
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              O encerramento da campanha não interrompe os descontos já
              contratados.
            </p>
          </fieldset>
          <fieldset>
            <legend className="mb-3 font-bold">
              {owner === "platform"
                ? "Planos participantes"
                : "Produtos e serviços participantes"}
            </legend>
            <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
              {targets.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={config.targetIds.includes(t.id)}
                    onChange={() => toggleTarget(t.id)}
                  />
                  <span>
                    {t.name}
                    <small className="block text-slate-500">
                      {t.recurring ? "Recorrente" : "Avulso"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Público
              <select
                className={field}
                value={config.audience}
                onChange={(e) =>
                  update({
                    audience: e.target.value as CampaignConfig["audience"],
                  })
                }
              >
                <option value="all">Todos os clientes elegíveis</option>
                <option value="new">Primeira compra</option>
                <option value="existing">Clientes que já compraram</option>
                <option value="inactive">Clientes inativos</option>
                <option value="selected">Selecionar clientes</option>
              </select>
            </label>
            <label className={label}>
              Usos por cliente nesta campanha
              <input
                className={field}
                type="number"
                min={1}
                max={100}
                value={config.maxUses}
                onChange={(e) => update({ maxUses: Number(e.target.value) })}
              />
            </label>
          </div>
          {config.audience === "selected" ? (
            <label className={label}>
              Clientes participantes
              <select
                multiple
                className={field + " h-36"}
                value={config.buyerIds}
                onChange={(e) =>
                  update({
                    buyerIds: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
              >
                {buyers.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset>
            <legend className="mb-3 font-bold">Quando oferecer</legend>
            <div className="flex flex-wrap gap-4">
              {(
                Object.keys(operationLabels) as (keyof typeof operationLabels)[]
              ).map((op) => (
                <label key={op} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.operations.includes(op)}
                    onChange={() =>
                      update({
                        operations: config.operations.includes(op)
                          ? config.operations.filter((v) => v !== op)
                          : [...config.operations, op],
                      })
                    }
                  />
                  {operationLabels[op]}
                </label>
              ))}
            </div>
          </fieldset>
          {config.operations.includes("upgrade") ? (
            <label className={label}>
              Planos/produtos de origem (vazio permite todos)
              <select
                className={field + " h-28"}
                multiple
                value={config.originIds}
                onChange={(e) =>
                  update({
                    originIds: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
              >
                {targets.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset className="space-y-3">
            <legend className="mb-3 font-bold">Períodos e preços</legend>
            <p className="text-xs leading-5 text-slate-500">
              Informe o preço total do período. Seis meses antecipados são uma
              cobrança cobrindo seis meses. O desconto do período continua nas
              renovações.
            </p>
            {config.options.map((o, i) => (
              <div
                key={o.id}
                className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_36px]"
              >
                <label className={label}>
                  Período
                  <select
                    className={field}
                    value={o.interval}
                    onChange={(e) =>
                      update({
                        options: config.options.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                id: e.target.value,
                                interval: e.target.value as CampaignInterval,
                              }
                            : v,
                        ),
                      })
                    }
                  >
                    {campaignIntervals.map((v) => (
                      <option key={v} value={v}>
                        {intervalLabels[v]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  Preço total normal (R$)
                  <input
                    className={field}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={o.price}
                    onChange={(e) =>
                      update({
                        options: config.options.map((v, j) =>
                          j === i ? { ...v, price: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label className={label}>
                  Desconto do período (%)
                  <input
                    className={field}
                    type="number"
                    min="0"
                    max="99.99"
                    step="0.01"
                    value={o.permanentDiscount}
                    onChange={(e) =>
                      update({
                        options: config.options.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                permanentDiscount: Number(e.target.value),
                              }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  aria-label={`Remover ${intervalLabels[o.interval]}`}
                  className="min-h-11 text-slate-500"
                  onClick={() =>
                    update({
                      options: config.options.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            <button
              className="text-sm font-semibold text-emerald-700"
              disabled={config.options.length >= 5}
              onClick={() => {
                const interval = campaignIntervals.find(
                  (v) => !config.options.some((o) => o.interval === v),
                );
                if (interval)
                  update({
                    options: [
                      ...config.options,
                      {
                        id: interval,
                        interval,
                        price: 100,
                        permanentDiscount: 0,
                      },
                    ],
                  });
              }}
            >
              + Adicionar período
            </button>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-3 font-bold">Etapas promocionais</legend>
            <p className="text-xs text-slate-500">
              Uma cobrança é um período completo. Em um plano mensal, três
              cobranças equivalem a três mensalidades. Vale o maior benefício,
              sem somar percentuais.
            </p>
            {config.stages.map((s, i) => (
              <div
                key={i}
                className="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[90px_1fr_1fr_36px]"
              >
                <label className={label}>
                  Cobranças
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={120}
                    value={s.cycles}
                    onChange={(e) =>
                      update({
                        stages: config.stages.map((v, j) =>
                          j === i
                            ? { ...v, cycles: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                <label className={label}>
                  Benefício
                  <select
                    className={field}
                    value={s.kind}
                    onChange={(e) =>
                      update({
                        stages: config.stages.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                kind: e.target.value as "percent" | "price",
                              }
                            : v,
                        ),
                      })
                    }
                  >
                    <option value="percent">Desconto (%)</option>
                    <option value="price">Preço promocional (R$)</option>
                  </select>
                </label>
                <label className={label}>
                  Valor
                  <input
                    className={field}
                    type="number"
                    min="0"
                    step="0.01"
                    value={s.value}
                    onChange={(e) =>
                      update({
                        stages: config.stages.map((v, j) =>
                          j === i ? { ...v, value: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="min-h-11 text-slate-500"
                  aria-label={`Remover etapa ${i + 1}`}
                  onClick={() =>
                    update({ stages: config.stages.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            <button
              className="text-sm font-semibold text-emerald-700"
              disabled={config.stages.length >= 12}
              onClick={() =>
                update({
                  stages: [
                    ...config.stages,
                    { cycles: 1, kind: "percent", value: 10 },
                  ],
                })
              }
            >
              + Adicionar etapa
            </button>
          </fieldset>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-bold text-emerald-950">Prévia de cobrança</h3>
            <div className="mt-3 space-y-3">
              {config.options.map((o) => {
                try {
                  const q = quoteCampaign("preview", 1, config, o.id);
                  return (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-center gap-2 text-sm text-emerald-950"
                    >
                      <b>{intervalLabels[o.interval]}</b>
                      <span>{money(q.price_brl)} agora</span>
                      <ArrowRight size={14} />
                      <span>{money(q.next_price_brl)} na próxima</span>
                      <small className="w-full text-emerald-800">
                        Após {totalCycles} cobrança(s) promocional(is):{" "}
                        {money(q.renewal_price_brl)} por período.
                      </small>
                    </div>
                  );
                } catch {
                  return (
                    <p key={o.id} className="text-sm">
                      Confira os valores da opção.
                    </p>
                  );
                }
              })}
            </div>
          </div>
          <label className={label}>
            Texto sugerido para divulgar
            <textarea
              className={field + " min-h-24"}
              value={config.message}
              maxLength={1000}
              onChange={(e) => update({ message: e.target.value })}
              placeholder="Conheça nossa oferta e confira as condições antes de contratar."
            />
            <span className="font-normal leading-5">
              Salvar ou publicar a campanha não envia mensagens. A divulgação
              pode ser preparada com este texto.
            </span>
          </label>
          {editing?.configuration.status === "active" ? (
            <AnnouncementPlanner
              key={editing.id + editing.revision}
              endpoint={endpoint}
              campaignId={editing.id}
              revision={editing.revision}
              buyers={buyers}
              channels={channels}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className="max-w-sm text-xs leading-5 text-slate-500">
              Alterações valem para novas adesões. Os contratos já aceitos
              preservam seus valores e etapas.
            </p>
            <button
              disabled={busy}
              onClick={save}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 font-bold text-white disabled:opacity-50"
            >
              <Save size={16} />
              {busy ? "Salvando…" : "Salvar campanha"}
            </button>
          </div>
        </div>
      </div>
      {owner === "store" ? (
        <SubscriptionConsole
          contracts={contracts}
          buyers={buyers}
          onCancel={cancelSubscription}
        />
      ) : null}
    </section>
  );
}
