"use client";
import { useEffect, useState } from "react";
import { Panel, NeonBadge } from "./panel-primitives";

type Policy = {
  follow_up_enabled: boolean;
  window_start: string;
  window_end: string;
  timezone: string;
};
type Activity = {
  id: string;
  journey: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  reason: string | null;
  leads?: { display_name: string | null } | null;
};
const statusLabels: Record<string, string> = {
  pending: "Programado",
  processing: "Preparando",
  sending: "Enviando",
  sent: "Aceito pelo WhatsApp",
  skipped: "Cancelado",
  failed: "Falhou",
  uncertain: "Confirmar entrega",
};
const reasonLabels: Record<string, string> = {
  attendance_agent_mismatch: "O envio não corresponde ao agente do atendimento",
  agent_assignment_changed: "A conexão mudou de agente; o remetente original foi preservado",
  disabled_by_company: "Desativado pela empresa",
  next_contact_window: "Aguardando horário permitido",
  lead_replied_after_reference: "O lead respondeu",
  conversation_changed_during_generation: "A conversa foi atualizada",
  order_changed_before_send: "O pedido mudou",
  sales_catalog_order_not_pending: "O pedido não está mais pendente",
  financial_review: "Pagamento em análise",
  disabled: "Automação desativada",
  max_follow_ups_reached: "Limite de retomadas atingido",
  contact_interval: "Intervalo entre contatos",
  unresolved_delivery: "Aguardando confirmação de um envio anterior",
  reference_not_found: "A conversa avançou além desta retomada",
  human_intervention: "Atendimento humano em andamento",
  empty_generation: "Nenhuma abordagem pertinente foi gerada",
  provider_rejected_or_unconfirmed: "O WhatsApp não confirmou o envio",
  delivery_confirmation_missing:
    "A confirmação de entrega precisa ser verificada",
};

export function IntelligentFollowUpPanel({ companyId }: { companyId: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [start, setStart] = useState("09:00"),
    [end, setEnd] = useState("20:00"),
    [timezone, setTimezone] = useState("America/Sao_Paulo");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/dashboard/automations?companyId=${encodeURIComponent(companyId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Não foi possível carregar.");
        if (!controller.signal.aborted) {
          setPolicy(data.policy);
          if (data.policy) {
            setStart(data.policy.window_start.slice(0, 5));
            setEnd(data.policy.window_end.slice(0, 5));
            setTimezone(data.policy.timezone);
          }
          setActivity(data.activity);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [companyId, revision]);
  function refresh() {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }
  async function toggle() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          action: "set_follow_up",
          enabled: !policy?.follow_up_enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Não foi possível salvar.");
      setPolicy(data.policy);
      refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Panel
        title="Follow-up inteligente"
        collapsible
        tone="cyan"
        action={
          <NeonBadge tone={policy?.follow_up_enabled ? "green" : "amber"}>
            {loading
              ? "Carregando"
              : error
                ? "Verificar"
                : policy === null
                  ? "Configuração por agente"
                  : policy.follow_up_enabled
                    ? "Ativo"
                    : "Desativado"}
          </NeonBadge>
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2 text-sm leading-6 text-slate-600">
            <p className="font-medium text-slate-800">Quem atendeu continua o contato: o follow-up usa o mesmo agente e WhatsApp do atendimento, automaticamente.</p>
            <p>
              Seu agente retoma conversas, recupera compras pendentes e convida
              clientes a voltar. Compras e interesses repetidos ajudam a
              escolher produtos pertinentes e horários com evidências de
              interação, mantendo a personalidade do atendimento.
            </p>
            <p>
              Por exemplo: se o cliente recebeu o Pix e deixou a compra
              pendente, o agente pode perguntar se houve alguma dificuldade.
              Respostas, pagamentos e pausas interrompem a retomada. Um cliente
              que compra o mesmo produto regularmente pode receber uma sugestão
              de recompra; uma visita registrada pode gerar um convite para
              voltar. Sem dados suficientes, a IA espera.
            </p>
            {policy === null && !loading && !error && (
              <p>
                As configurações anteriores de cada agente continuam valendo. Ao
                ativar aqui, a empresa passa a usar o controle central.
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(policy?.follow_up_enabled)}
            aria-label="Follow-up inteligente para a empresa"
            disabled={loading || saving || Boolean(error)}
            onClick={toggle}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving
              ? "Salvando…"
              : policy?.follow_up_enabled
                ? "Desativar"
                : "Ativar follow-up"}
          </button>
        </div>
        {policy && (
          <details className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">
              Horários permitidos · opcional
            </summary>
            <p className="my-2 text-slate-500">
              A IA procura o melhor momento dentro desta janela. Ajuste se sua
              empresa atende à noite. Preferências do lead também são
              respeitadas.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label>
                Início
                <input
                  aria-label="Início da janela de follow-up"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="ml-2 rounded border p-2"
                />
              </label>
              <label>
                Fim
                <input
                  aria-label="Fim da janela de follow-up"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="ml-2 rounded border p-2"
                />
              </label>
              <label>
                Fuso
                <select
                  aria-label="Fuso do follow-up"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="ml-2 rounded border p-2"
                >
                  <option value="America/Sao_Paulo">Brasília</option>
                  <option value="America/Manaus">Manaus</option>
                  <option value="America/Rio_Branco">Rio Branco</option>
                  <option value="America/Noronha">Fernando de Noronha</option>
                </select>
              </label>
              <button
                type="button"
                disabled={saving || loading}
                className="rounded-lg border px-3 py-2"
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    const response = await fetch("/api/dashboard/automations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        companyId,
                        action: "set_window",
                        start,
                        end,
                        timezone,
                      }),
                    });
                    const data = await response.json();
                    if (!response.ok)
                      throw new Error(data.error ?? "Não foi possível salvar.");
                    setPolicy(data.policy);
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "Falha ao salvar.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Salvar horários
              </button>
            </div>
          </details>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}{" "}
            <button type="button" onClick={refresh} className="underline">
              Tentar novamente
            </button>
          </p>
        )}
      </Panel>
      <Panel
        title="Atividade de relacionamento"
        collapsible
        tone="violet"
        action={
          <NeonBadge tone="violet">
            {activity.length} registros recentes
          </NeonBadge>
        }
      >
        <button
          type="button"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
          className="mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          Atualizar
        </button>
        {!activity.length && (
          <p className="text-sm text-slate-500">
            {loading
              ? "Carregando atividades…"
              : error
                ? "Atividades indisponíveis."
                : "As próximas retomadas e seus resultados aparecerão aqui."}
          </p>
        )}
        <div className="grid gap-2">
          {activity.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-800">
                  {
                    (
                      {
                        recovery: "Recuperação de compra",
                        conversation: "Retomada de conversa",
                        return: "Convite de retorno",
                        recommendation: "Recomendação",
                      } as Record<string, string>
                    )[item.journey]
                  }{" "}
                  · {statusLabels[item.status] ?? item.status}
                </p>
                <p className="text-xs text-slate-600">
                  {item.leads?.display_name ?? "Contato cadastrado"}
                </p>
                <p className="text-xs text-slate-500">
                  {item.reason
                    ? (reasonLabels[item.reason] ??
                      "Execução registrada para análise.")
                    : "A elegibilidade será verificada antes de enviar."}
                </p>
              </div>
              {item.status === "uncertain" && (
                <button
                  type="button"
                  disabled={saving}
                  className="rounded-lg border px-3 py-2 text-xs"
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const response = await fetch(
                        "/api/dashboard/automations",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            companyId,
                            action: "close_uncertain",
                            dispatchId: item.id,
                          }),
                        },
                      );
                      if (!response.ok)
                        throw new Error(
                          "Não foi possível encerrar a verificação.",
                        );
                      refresh();
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Falha ao atualizar.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Conferi a conversa: encerrar sem reenviar
                </button>
              )}
              <time
                className="text-xs text-slate-500"
                dateTime={item.sent_at ?? item.scheduled_for}
              >
                {new Date(item.sent_at ?? item.scheduled_for).toLocaleString(
                  "pt-BR",
                )}
              </time>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
