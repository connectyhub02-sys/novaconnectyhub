"use client";
import { useEffect, useState } from "react";
import { Panel, NeonBadge } from "./panel-primitives";
import type { AgendaResource, AgendaBooking } from "@/lib/automations/agenda";
type Agenda = {
  settings: { enabled: boolean; timezone: string };
  resources: AgendaResource[];
  bookings: AgendaBooking[];
  notices?: Array<{
    id: string;
    audience: string;
    kind: string;
    status: string;
    due_at: string;
    reason: string | null;
  }>;
};
const field =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";
const button =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50";
export function CustomerAgendaPanel({
  companyId,
  agentId,
}: {
  companyId: string;
  agentId?: string;
}) {
  const [agenda, setAgenda] = useState<Agenda | null>(null),
    [leads, setLeads] = useState<
      Array<{ id: string; display_name: string | null }>
    >([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false),
    [bookingOpen, setBookingOpen] = useState(false);
  const [name, setName] = useState(""),
    [service, setService] = useState(""),
    [kind, setKind] = useState("service"),
    [duration, setDuration] = useState(30),
    [capacity, setCapacity] = useState(1),
    [returnDays, setReturnDays] = useState("");
  const [days, setDays] = useState([1, 2, 3, 4, 5]),
    [opens, setOpens] = useState("09:00"),
    [closes, setCloses] = useState("18:00");
  const [leadId, setLeadId] = useState(""),
    [resourceId, setResourceId] = useState(""),
    [party, setParty] = useState(1),
    [from, setFrom] = useState(""),
    [slots, setSlots] = useState<Array<{ starts_at: string; ends_at: string }>>(
      [],
    ),
    [requestKey, setRequestKey] = useState("");
  const [search, setSearch] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [editResourceId, setEditResourceId] = useState<string | null>(null),
    [resourceEnabled, setResourceEnabled] = useState(true),
    [blockedDates, setBlockedDates] = useState(""),
    [breakStart, setBreakStart] = useState(""),
    [breakEnd, setBreakEnd] = useState("");
  const [rescheduling, setRescheduling] = useState<AgendaBooking | null>(null),
    [timezoneDraft, setTimezoneDraft] = useState("America/Sao_Paulo");
  function editResource(resource: AgendaResource) {
    setEditResourceId(resource.id);
    setName(resource.name);
    setService(resource.service_name);
    setKind(resource.kind);
    setDuration(resource.duration_minutes);
    setCapacity(resource.capacity);
    setReturnDays(resource.return_days ? String(resource.return_days) : "");
    setResourceEnabled(resource.enabled);
    setBlockedDates(resource.blocked_dates.join(", "));
    setDays(resource.weekly_hours[0]?.days ?? []);
    setOpens(resource.weekly_hours[0]?.start ?? "09:00");
    setCloses(resource.weekly_hours.at(-1)?.end ?? "18:00");
    setBreakStart(
      resource.weekly_hours.length === 2 ? resource.weekly_hours[0].end : "",
    );
    setBreakEnd(
      resource.weekly_hours.length === 2 ? resource.weekly_hours[1].start : "",
    );
    setEditing(true);
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        fetch(
          `/api/dashboard/agenda?companyId=${encodeURIComponent(companyId)}&search=${encodeURIComponent(search)}`,
          { signal: controller.signal, cache: "no-store" },
        )
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (!controller.signal.aborted) {
              setAgenda(data);
              setTimezoneDraft(data.settings.timezone);
              setLeads(data.leads ?? []);
              setCheckedAt(Date.now());
            }
          })
          .catch((failure) => {
            if (!controller.signal.aborted) setError(failure.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, revision, search]);
  function refresh() {
    setError("");
    setLoading(true);
    setRevision((value) => value + 1);
  }
  async function action(payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, agentId, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.settings) {
        setAgenda(data);
        setRevision((value) => value + 1);
      }
      if (data.slots) setSlots(data.slots);
      return data;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível concluir.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }
  const timezone = agenda?.settings.timezone ?? "America/Sao_Paulo";
  const when = (date: string) =>
    new Date(date).toLocaleString("pt-BR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <Panel
      title="Agenda inteligente"
      collapsible
      tone="green"
      action={
        <NeonBadge tone={agenda?.settings.enabled ? "green" : "amber"}>
          {loading
            ? "Carregando"
            : error
              ? "Verificar"
              : agenda?.settings.enabled
                ? "Ativa"
                : "Desativada"}
        </NeonBadge>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Organize serviços, profissionais e mesas. A agenda verifica a
            disponibilidade e registra reservas e alterações. O comparecimento
            alimenta os convites de retorno quando o follow-up estiver ativo.
          </p>
          <button
            type="button"
            className={button}
            disabled={loading || saving || !agenda}
            onClick={() =>
              action({
                action: "set_enabled",
                enabled: !agenda?.settings.enabled,
              })
            }
          >
            {agenda?.settings.enabled ? "Desativar agenda" : "Ativar agenda"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}{" "}
            <button type="button" onClick={refresh} className="underline">
              Atualizar
            </button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              setEditing((value) => !value);
              setEditResourceId(null);
              setResourceEnabled(true);
            }}
          >
            {editing ? "Recolher cadastro" : "Cadastrar serviço ou mesa"}
          </button>
          <button
            type="button"
            className={button}
            disabled={!agenda?.settings.enabled}
            onClick={() => {
              setBookingOpen((value) => !value);
              setRescheduling(null);
              setSlots([]);
              setRequestKey(crypto.randomUUID());
            }}
          >
            Nova reserva
          </button>
          <button
            type="button"
            className={button}
            onClick={refresh}
            disabled={loading}
          >
            Atualizar
          </button>
          <span className="self-center text-xs text-slate-500">
            Horários em {timezone}
          </span>
        </div>
        <details className="rounded-lg border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer">
            Serviços e horários de funcionamento
          </summary>
          <div className="mt-3 space-y-3">
            {agenda?.resources.map((resource) => (
              <div
                key={resource.id}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {resource.name} · {resource.service_name} ·{" "}
                  {resource.duration_minutes} min ·{" "}
                  {resource.enabled ? "Disponível" : "Pausado"}
                </span>
                <button
                  type="button"
                  className={button}
                  onClick={() => editResource(resource)}
                >
                  Editar
                </button>
              </div>
            ))}
            <label>
              Fuso da empresa
              <select
                className={field}
                value={timezoneDraft}
                onChange={(event) => setTimezoneDraft(event.target.value)}
              >
                {[
                  "America/Sao_Paulo",
                  "America/Manaus",
                  "America/Rio_Branco",
                  "America/Noronha",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={button}
              disabled={saving}
              onClick={() =>
                action({ action: "set_timezone", timezone: timezoneDraft })
              }
            >
              Salvar fuso
            </button>
            <p className="text-xs text-slate-500">
              Alterações de funcionamento afetam novas reservas. Compromissos já
              registrados devem ser remarcados individualmente.
            </p>
          </div>
        </details>
        <div
          hidden={!editing}
          className="space-y-3 rounded-xl border border-slate-200 p-4"
        >
          <p className="text-sm text-slate-600">
            Confira os horários sugeridos antes de salvar. Para cada
            profissional ou mesa, crie um recurso.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Profissional ou mesa
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: João / Mesa 1"
              />
            </label>
            <label className="text-sm">
              Serviço
              <input
                className={field}
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="Ex.: Corte de cabelo / Reserva de mesa"
              />
            </label>
            <label className="text-sm">
              Tipo
              <select
                className={field}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="service">Atendimento</option>
                <option value="table">Mesa exclusiva</option>
              </select>
            </label>
            <label className="text-sm">
              Duração em minutos
              <input
                className={field}
                type="number"
                min={5}
                max={720}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              {kind === "table"
                ? "Pessoas por mesa"
                : "Atendimentos simultâneos"}
              <input
                className={field}
                type="number"
                min={1}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              Convidar para voltar após quantos dias? (opcional)
              <input
                className={field}
                type="number"
                min={1}
                max={730}
                value={returnDays}
                onChange={(e) => setReturnDays(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
              (label, index) => (
                <label key={label} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={days.includes(index + 1)}
                    onChange={() =>
                      setDays((current) =>
                        current.includes(index + 1)
                          ? current.filter((day) => day !== index + 1)
                          : [...current, index + 1],
                      )
                    }
                  />
                  {label}
                </label>
              ),
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Abre às
              <input
                type="time"
                className={field}
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Fecha às
              <input
                type="time"
                className={field}
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Início do intervalo (opcional)
              <input
                type="time"
                className={field}
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Fim do intervalo
              <input
                type="time"
                className={field}
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            Datas sem atendimento (AAAA-MM-DD, separadas por vírgula)
            <input
              className={field}
              value={blockedDates}
              onChange={(e) => setBlockedDates(e.target.value)}
              placeholder="2026-12-25, 2027-01-01"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={resourceEnabled}
              onChange={(e) => setResourceEnabled(e.target.checked)}
            />
            Aceitar novas reservas neste recurso
          </label>
          <button
            type="button"
            disabled={saving}
            className={button}
            onClick={async () => {
              if (
                Boolean(breakStart) !== Boolean(breakEnd) ||
                (breakStart &&
                  (breakStart <= opens ||
                    breakEnd >= closes ||
                    breakStart >= breakEnd))
              ) {
                setError(
                  "Confira o intervalo dentro do horário de funcionamento.",
                );
                return;
              }
              const result = await action({
                action: editResourceId ? "update_resource" : "create_resource",
                resourceId: editResourceId,
                resource: {
                  name,
                  service_name: service,
                  kind,
                  duration_minutes: duration,
                  capacity,
                  return_days: returnDays,
                  enabled: resourceEnabled,
                  blocked_dates: blockedDates
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                  weekly_hours:
                    breakStart && breakEnd
                      ? [
                          { days, start: opens, end: breakStart },
                          { days, start: breakEnd, end: closes },
                        ]
                      : [{ days, start: opens, end: closes }],
                },
              });
              if (result) {
                setEditing(false);
                setName("");
                setService("");
                setEditResourceId(null);
              }
            }}
          >
            Salvar recurso
          </button>
        </div>
        <div
          hidden={!bookingOpen}
          className="space-y-3 rounded-xl border border-slate-200 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Buscar contato
              <input
                className={field}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Contato
              <select
                className={field}
                disabled={Boolean(rescheduling)}
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                <option value="">Escolha o contato</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.display_name ?? "Contato sem nome"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Recurso
              <select
                className={field}
                disabled={Boolean(rescheduling)}
                value={resourceId}
                onChange={(e) => {
                  setResourceId(e.target.value);
                  setSlots([]);
                }}
              >
                <option value="">Escolha o recurso</option>
                {agenda?.resources
                  .filter((r) => r.enabled)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.service_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              Buscar a partir de (horário deste dispositivo)
              <input
                className={field}
                type="datetime-local"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setSlots([]);
                }}
              />
            </label>
            <label className="text-sm">
              Pessoas (mesa)
              <input
                className={field}
                type="number"
                min={1}
                value={party}
                onChange={(e) => {
                  setParty(Number(e.target.value));
                  setSlots([]);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className={button}
            disabled={saving || !resourceId || !from || !leadId}
            onClick={() =>
              action({
                action: "availability",
                bookingId: rescheduling?.id,
                resourceId,
                from: new Date(from).toISOString(),
                partySize: party,
              })
            }
          >
            Consultar horários
          </button>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                type="button"
                key={slot.starts_at}
                disabled={saving}
                className={button}
                onClick={async () => {
                  const result = await action({
                    action: rescheduling ? "reschedule" : "book",
                    bookingId: rescheduling?.id,
                    version: rescheduling?.version,
                    leadId,
                    resourceId,
                    partySize: party,
                    startsAt: slot.starts_at,
                    requestKey,
                  });
                  if (result) {
                    setBookingOpen(false);
                    setSlots([]);
                    setRescheduling(null);
                  }
                }}
              >
                Reservar {when(slot.starts_at)}
              </button>
            ))}
          </div>
        </div>
        {!agenda?.resources.length && !loading && (
          <p className="text-sm text-slate-500">
            Cadastre o primeiro serviço ou mesa para começar.
          </p>
        )}
        <div className="grid gap-2">
          {agenda?.bookings.map((booking) => (
            <div
              key={booking.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {when(booking.starts_at)} ·{" "}
                  {
                    agenda.resources.find((r) => r.id === booking.resource_id)
                      ?.name
                  }
                </p>
                <p className="text-slate-500">
                  {booking.lead?.display_name ??
                    leads.find((lead) => lead.id === booking.lead_id)
                      ?.display_name ??
                    "Contato cadastrado"}{" "}
                  ·{" "}
                  {
                    (
                      {
                        booked: "Reservado",
                        cancelled: "Cancelado",
                        completed: "Realizado",
                        no_show: "Não compareceu",
                      } as Record<string, string>
                    )[booking.status]
                  }
                  {booking.confirmed_at ? " · Confirmado" : ""}
                </p>
              </div>
              {booking.status === "booked" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={saving}
                    onClick={() => {
                      setRescheduling(booking);
                      setLeadId(booking.lead_id);
                      setResourceId(booking.resource_id);
                      setParty(booking.party_size);
                      setSlots([]);
                      setRequestKey(crypto.randomUUID());
                      setBookingOpen(true);
                    }}
                  >
                    Remarcar
                  </button>
                  {!booking.confirmed_at && (
                    <button
                      type="button"
                      className={button}
                      disabled={saving}
                      onClick={() =>
                        action({
                          action: "confirm",
                          bookingId: booking.id,
                          version: booking.version,
                        })
                      }
                    >
                      Confirmar
                    </button>
                  )}
                  {Date.parse(booking.starts_at) <= checkedAt && (
                    <>
                      <button
                        type="button"
                        className={button}
                        disabled={saving}
                        onClick={() =>
                          action({
                            action: "complete",
                            bookingId: booking.id,
                            version: booking.version,
                          })
                        }
                      >
                        Realizado
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={saving}
                        onClick={() =>
                          action({
                            action: "no_show",
                            bookingId: booking.id,
                            version: booking.version,
                          })
                        }
                      >
                        Não compareceu
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={button}
                    disabled={saving}
                    onClick={() =>
                      action({
                        action: "cancel",
                        bookingId: booking.id,
                        version: booking.version,
                      })
                    }
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm">Avisos da agenda</summary>
          <div className="mt-2 space-y-2">
            {!agenda?.notices?.length && (
              <p className="text-xs text-slate-500">
                Lembretes e avisos aos responsáveis aparecerão aqui.
              </p>
            )}
            {agenda?.notices?.map((notice) => (
              <div
                key={notice.id}
                className="rounded border border-slate-100 p-2 text-xs"
              >
                <span className="font-medium">
                  {notice.audience === "lead" ? "Cliente" : "Responsável"} ·{" "}
                  {
                    (
                      {
                        pending: "Programado",
                        processing: "Preparando",
                        sending: "Enviando",
                        sent: "Aceito pelo WhatsApp",
                        skipped: "Cancelado após atualização",
                        failed: "Precisa de atenção",
                        uncertain: "Entrega sem confirmação",
                      } as Record<string, string>
                    )[notice.status]
                  }
                </span>
                <p className="text-slate-500">
                  {when(notice.due_at)}
                  {notice.reason === "missing_responsible_agent"
                    ? " · Vincule o atendimento a um agente com responsável cadastrado."
                    : notice.reason === "original_attendance_unavailable"
                      ? " · O agente ou WhatsApp original do atendimento está indisponível. Nenhum outro remetente foi usado."
                    : notice.reason === "whatsapp_unavailable"
                      ? " · Confira a conexão do agente."
                      : notice.status === "uncertain"
                        ? " · Confira a conversa antes de reenviar manualmente."
                        : ""}
                </p>
              </div>
            ))}
          </div>
        </details>
      </div>
    </Panel>
  );
}
