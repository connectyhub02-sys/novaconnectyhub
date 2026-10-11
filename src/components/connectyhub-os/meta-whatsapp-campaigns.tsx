"use client";
import { useRef, useState } from "react";
import {
  Plus,
  Pause,
  Play,
  Download,
  CalendarClock,
  Users,
  Send,
  CheckCheck,
  AlertCircle,
} from "lucide-react";
import {
  campaignPhones,
  templateParameters,
  variableCount,
  type OfficialTemplate,
} from "@/lib/meta/whatsapp-workspace-policy";
import {
  OfficialTemplatePreview,
  OfficialVariables,
} from "./meta-whatsapp-models";
import {
  type Campaign,
  type Sender,
  officialField as field,
  officialPrimary as primary,
  officialSecondary as secondary,
  officialStatus,
} from "./meta-whatsapp-types";
type Props = {
  campaigns: Campaign[];
  senders: Sender[];
  sender: string;
  templates: OfficialTemplate[];
  busy: boolean;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  onSender: (v: string) => void;
  onPrepare: (body: Record<string, unknown>) => Promise<void>;
  onAction: (id: string, action: string, accepted?: boolean) => Promise<void>;
  onExport: (id: string) => Promise<void>;
};
export function OfficialCampaignPanel(p: Props) {
  const [name, setName] = useState(""),
    [phones, setPhones] = useState(""),
    [model, setModel] = useState(""),
    [parameters, setParameters] = useState<string[]>([]),
    [consent, setConsent] = useState(false),
    [consentNote, setConsentNote] = useState(""),
    [scheduled, setScheduled] = useState(""),
    [review, setReview] = useState<string | null>(null),
    [costAccepted, setCostAccepted] = useState(false);
  const [fileError,setFileError]=useState("");
  const key = useRef<string | null>(null);
  const changed = () => {
    key.current = null;
  };
  const selected = p.templates.find((t) => t.id === model);
  let count = 0;
  try {
    count = campaignPhones(phones).length;
  } catch {}
  const reviewing = p.campaigns.find((c) => c.id === review);
  const supported = p.templates.filter((t) => {
    try {
      templateParameters(
        t,
        Array.from(
          {
            length: variableCount(
              t.components.find((c) => c.type === "BODY")?.text ?? "",
            ),
          },
          () => "exemplo",
        ),
      );
      return t.status === "APPROVED";
    } catch {
      return false;
    }
  });
  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Campanhas oficiais
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Escolha o número, o público e um modelo aprovado. Revise antes de
            iniciar.
          </p>
        </div>
        <button className={primary} onClick={() => p.setCreateOpen(true)}>
          <Plus size={17} /> Nova campanha
        </button>
      </div>
      {p.createOpen && (
        <form
          className="grid gap-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-5 lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            key.current ??= crypto.randomUUID();
            void p
              .onPrepare({
                name,
                phones,
                sender: p.sender,
                templateName: selected?.name,
                language: selected?.language,
                parameters,
                consent,
                consentNote,
                scheduledAt: scheduled
                  ? new Date(scheduled).toISOString()
                  : null,
                requestKey: key.current,
              })
              .then(() => {
                p.setCreateOpen(false);
                key.current = null;
              })
              .catch(() => {});
          }}
        >
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900">Preparar campanha</h3>
            <label className="block text-xs text-slate-600">
              Nome da campanha
              <input
                className={`${field} mt-1`}
                maxLength={120}
                value={name}
                onChange={(e) => {
                  changed();
                  setName(e.target.value);
                }}
                placeholder="Novidades de outubro"
                required
              />
            </label>
            <label className="block text-xs text-slate-600">
              Número remetente
              <select
                className={`${field} mt-1`}
                value={p.sender}
                onChange={(e) => {
                  changed();
                  p.onSender(e.target.value);
                  setModel("");
                  setParameters([]);
                }}
                required
              >
                <option value="">Selecione um número</option>
                {p.senders
                  .filter((s) => s.status === "connected")
                  .map((s) => (
                    <option key={s.phone_number_id} value={s.phone_number_id}>
                      {s.label || s.verified_name} · {s.display_phone}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              Modelo aprovado
              <select
                className={`${field} mt-1`}
                value={model}
                onChange={(e) => {
                  changed();
                  setModel(e.target.value);
                  setParameters([]);
                }}
                required
              >
                <option value="">Selecione um modelo</option>
                {supported.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
            </label>
            <OfficialVariables
              text={
                selected?.components.find((c) => c.type === "BODY")?.text ?? ""
              }
              values={parameters}
              onChange={(v) => {
                changed();
                setParameters(v);
              }}
            />
            <label className="block text-xs text-slate-600">
              Agendamento (opcional)
              <input
                className={`${field} mt-1`}
                type="datetime-local"
                value={scheduled}
                onChange={(e) => {
                  changed();
                  setScheduled(e.target.value);
                }}
              />
            </label>
            <p className="text-xs text-slate-500">
              Horário local deste navegador. Sem data, a fila começa após sua
              confirmação.
            </p>
          </div>
          <div className="space-y-3">
            <label className="block text-xs text-slate-600">
              Destinatários · um telefone por linha, com DDI e DDD
              <textarea
                className={`${field} mt-1 font-mono`}
                rows={5}
                maxLength={300000}
                value={phones}
                onChange={(e) => {
                  changed();
                  setPhones(e.target.value);
                }}
                placeholder={"5511999999999\n5521999999999"}
                required
              />
            </label>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {count.toLocaleString("pt-BR")} números únicos · máximo 10.000
              </span>
              <label className="cursor-pointer font-semibold text-blue-600">
                Importar TXT/CSV
                <input
                  type="file"
                  className="sr-only"
                  accept=".txt,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setFileError(f&&f.size>300000?"Use um arquivo de até 300 KB, contendo somente telefones.":"");
                    if (f && f.size <= 300000)
                      void f.text().then((v) => {
                        changed();
                        setPhones(v);
                      }).catch(()=>setFileError("Não foi possível ler o arquivo."));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {fileError&&<p role="alert" className="text-xs text-red-600">{fileError}</p>}
            <p className="text-xs text-slate-500">TXT ou CSV com apenas telefones, sem cabeçalho.</p>
            <label className="flex gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => {
                  changed();
                  setConsent(e.target.checked);
                }}
              />{" "}
              Tenho autorização dos destinatários para receber estas mensagens.
            </label>
            <label className="block text-xs text-slate-600">
              Como essa autorização foi obtida?
              <input
                className={`${field} mt-1`}
                required
                minLength={5}
                maxLength={500}
                value={consentNote}
                onChange={(e) => {
                  changed();
                  setConsentNote(e.target.value);
                }}
                placeholder="Ex.: formulário de inscrição na campanha"
              />
            </label>
            <p className="text-xs text-slate-500">
              Pedidos de saída serão respeitados novamente no momento de cada
              envio. Contatos bloqueados não recebem.
            </p>
            {selected && (
              <OfficialTemplatePreview
                template={selected}
                values={parameters}
              />
            )}
            <div className="flex gap-2">
              <button
                className={primary}
                disabled={p.busy || !selected || !p.sender || !count}
              >
                Salvar para revisão
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => p.setCreateOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}
      {reviewing && (
        <section
          className="rounded-2xl border-2 border-blue-500 bg-white p-5"
          aria-label="Revisão da campanha"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
                Revisão antes do envio
              </p>
              <h3 className="mt-2 text-lg font-bold">{reviewing.name}</h3>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div>
                  <dt className="inline font-semibold">Remetente: </dt>
                  <dd className="inline">
                    {p.senders.find(
                      (s) => s.phone_number_id === reviewing.phone_number_id,
                    )?.display_phone ?? "Desconectado"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Público: </dt>
                  <dd className="inline">{reviewing.total} números únicos</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Início: </dt>
                  <dd className="inline">
                    {new Date(reviewing.scheduled_at).toLocaleString("pt-BR")}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                A Meta pode cobrar pelas mensagens conforme categoria, país e
                conta. Esta tela não calcula uma tarifa garantida nem adiciona
                margem da ConnectyHub. Fila inicial: até 20 destinatários por
                minuto, sujeita aos limites e à qualidade da conta.
              </p>
              <label className="mt-4 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={costAccepted}
                  onChange={(e) => setCostAccepted(e.target.checked)}
                />{" "}
                Revisei o número, os destinatários e o modelo e autorizo iniciar
                os envios e os custos de uso da Meta.
              </label>
              <div className="mt-4 flex gap-2">
                <button
                  className={primary}
                  disabled={p.busy || !costAccepted}
                  onClick={() =>
                    void p
                      .onAction(reviewing.id, "start", true)
                      .then(() => setReview(null))
                      .catch(() => {})
                  }
                >
                  <Send size={16} /> Confirmar e iniciar
                </button>
                <button className={secondary} onClick={() => setReview(null)}>
                  Voltar
                </button>
              </div>
            </div>
            <OfficialTemplatePreview
              template={reviewing.template_snapshot}
              values={reviewing.parameters}
            />
          </div>
        </section>
      )}
      <div className="space-y-3">
        {p.campaigns.map((c) => (
          <article
            key={c.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-900">{c.name}</h3>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                    {officialStatus[c.status] || c.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {p.senders.find(
                    (s) => s.phone_number_id === c.phone_number_id,
                  )?.display_phone ?? c.phone_number_id}{" "}
                  · {c.template_name} ·{" "}
                  {new Date(c.scheduled_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["draft", "paused"].includes(c.status) && (
                  <button
                    className={secondary}
                    disabled={p.busy}
                    onClick={() => {
                      setReview(c.id);
                      setCostAccepted(false);
                    }}
                  >
                    <Play size={14} /> Revisar{" "}
                    {c.status === "paused" ? "retomada" : "envio"}
                  </button>
                )}
                {c.status === "running" && (
                  <button
                    className={secondary}
                    disabled={p.busy}
                    onClick={() =>
                      void p.onAction(c.id, "pause").catch(() => {})
                    }
                  >
                    <Pause size={14} /> Pausar
                  </button>
                )}
                {["draft", "paused", "running"].includes(c.status) && (
                  <button
                    className={secondary}
                    disabled={p.busy}
                    onClick={() =>
                      void p.onAction(c.id, "cancel").catch(() => {})
                    }
                  >
                    Cancelar pendentes
                  </button>
                )}
                <button
                  className={secondary}
                  onClick={() => void p.onExport(c.id).catch(() => {})}
                >
                  <Download size={14} /> Resultados
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm lg:grid-cols-6">
              {[
                ["Público", c.total],
                ["Na fila", c.counts.pending ?? 0],
                [
                  "Aceitas / enviadas",
                  (c.counts.sent ?? 0) +
                    (c.counts.delivered ?? 0) +
                    (c.counts.read ?? 0),
                ],
                ["Entregues", (c.counts.delivered ?? 0) + (c.counts.read ?? 0)],
                ["Lidas", c.counts.read ?? 0],
                [
                  "Falhas / revisão",
                  (c.counts.failed ?? 0) +
                    (c.counts.skipped ?? 0) +
                    (c.counts.uncertain ?? 0),
                ],
              ].map(([label, n]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{n}</p>
                </div>
              ))}
            </div>
            {(c.counts.uncertain ?? 0) > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                Há envios sem confirmação conclusiva. Eles não serão repetidos
                automaticamente.
              </p>
            )}
          </article>
        ))}
      </div>
      {!p.campaigns.length && !p.createOpen && (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <CalendarClock className="mx-auto mb-4 text-blue-500" size={36} />
          <h3 className="font-semibold text-slate-900">
            Sua primeira campanha começa aqui
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Prepare o público, escolha um número conectado e use um modelo
            aprovado pela Meta.
          </p>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Pausar ou cancelar interrompe os próximos envios. Uma mensagem já em
        processamento pode ser concluída. Nenhuma campanha usa o canal conectado
        por QR.
      </p>
    </div>
  );
}
export function OfficialReports({ campaigns }: { campaigns: Campaign[] }) {
  const sum = (key: string) =>
    campaigns.reduce((a, c) => a + (c.counts[key] ?? 0), 0);
  return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-bold text-slate-900">
        Resultados das campanhas
      </h2>
      <p className="text-sm text-slate-500">
        Últimas {campaigns.length} campanhas. Entregas e leituras vêm dos
        recibos reais da Meta.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Destinatários",
            value: campaigns.reduce((a, c) => a + c.total, 0),
            icon: Users,
          },
          {
            label: "Entregues",
            value: sum("delivered") + sum("read"),
            icon: CheckCheck,
          },
          { label: "Lidas", value: sum("read"), icon: Send },
          {
            label: "Precisam de atenção",
            value: sum("failed") + sum("uncertain") + sum("skipped"),
            icon: AlertCircle,
          },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-slate-200 bg-white p-6"
          >
            <m.icon className="mb-4 text-blue-600" size={22} />
            <p className="text-sm text-slate-500">{m.label}</p>
            <strong className="mt-2 block text-3xl text-slate-900">
              {m.value.toLocaleString("pt-BR")}
            </strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Ausência de recibo de leitura não significa que a mensagem não foi
        vista. Para consultar cada destinatário, exporte os resultados na aba
        Campanhas.
      </p>
    </div>
  );
}
