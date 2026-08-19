"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, PlayCircle, Save, ShieldCheck } from "lucide-react";
import type {
  UazapiCostGuardAdminState,
  UazapiCostGuardRunSummary,
} from "@/lib/whatsapp/uazapi-cost-guard";
import { cn } from "@/lib/utils";
import { KpiStat, NeonBadge, Panel } from "./panel-primitives";

type ApiResponse = {
  ok?: boolean;
  state?: UazapiCostGuardAdminState;
  summary?: UazapiCostGuardRunSummary;
  error?: {
    message?: string;
  };
};

export function UazapiCostGuardPanel({
  initialState,
}: {
  initialState: UazapiCostGuardAdminState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [enabled, setEnabled] = useState(initialState.settings.enabled);
  const [runTimeLocal, setRunTimeLocal] = useState(initialState.settings.runTimeLocal);
  const [trialGraceDays, setTrialGraceDays] = useState(String(initialState.settings.trialGraceDays));
  const [maxDeletionsPerRun, setMaxDeletionsPerRun] = useState(String(initialState.settings.maxDeletionsPerRun));
  const [running, setRunning] = useState<"save" | "dry_run" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; message: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<UazapiCostGuardRunSummary | null>(null);

  const dirty = useMemo(
    () =>
      enabled !== state.settings.enabled ||
      runTimeLocal !== state.settings.runTimeLocal ||
      Number(trialGraceDays) !== state.settings.trialGraceDays ||
      Number(maxDeletionsPerRun) !== state.settings.maxDeletionsPerRun,
    [enabled, maxDeletionsPerRun, runTimeLocal, state.settings, trialGraceDays],
  );

  async function postAction(payload: Record<string, unknown>, runningKey: "save" | "dry_run") {
    setRunning(runningKey);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/whatsapp/cost-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !data?.ok || !data.state) {
        throw new Error(data?.error?.message ?? "Acao nao concluida.");
      }

      setState(data.state);
      setEnabled(data.state.settings.enabled);
      setRunTimeLocal(data.state.settings.runTimeLocal);
      setTrialGraceDays(String(data.state.settings.trialGraceDays));
      setMaxDeletionsPerRun(String(data.state.settings.maxDeletionsPerRun));
      setLastSummary(data.summary ?? null);
      setNotice({
        tone: runningKey === "dry_run" ? "warning" : "success",
        message: runningKey === "dry_run"
          ? "Teste concluido sem excluir instancias."
          : "Regra da Uazapi salva.",
      });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      setRunning(null);
    }
  }

  function saveSettings() {
    void postAction({
      action: "update_settings",
      enabled,
      runTimeLocal,
      trialGraceDays: Number(trialGraceDays),
      maxDeletionsPerRun: Number(maxDeletionsPerRun),
    }, "save");
  }

  function runDryRun() {
    void postAction({ action: "run_dry_run" }, "dry_run");
  }

  const latestSummary = lastSummary ?? state.settings.lastManualDryRunSummary ?? state.settings.lastScheduledRunSummary;
  const disabled = running !== null;

  return (
    <Panel
      className="mb-5"
      title="Limpeza Uazapi"
      eyebrow="custo / instancias / agenda"
      tone={state.settings.enabled ? "green" : "amber"}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <NeonBadge tone={state.settings.enabled ? "green" : "amber"}>
            {state.settings.enabled ? "ativa" : "desativada"}
          </NeonBadge>
          <NeonBadge tone="cyan">{state.scheduler.nextRunLabel}</NeonBadge>
        </div>
      }
    >
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiStat label="uazapi" value={String(state.snapshot.total)} tone="cyan" />
            <KpiStat label="conectadas" value={String(state.snapshot.connected)} tone="green" />
            <KpiStat label="desconectadas" value={String(state.snapshot.disconnected)} tone="amber" />
            <KpiStat label="api / agentes" value={`${state.snapshot.apiCustomer}/${state.snapshot.clientAgent}`} tone="violet" />
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <label className="grid gap-1 rounded-xl border border-slate-200 bg-white/70 p-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Status</span>
              <span className="inline-flex h-10 items-center gap-2">
                <input
                  checked={enabled}
                  className="h-4 w-4 accent-red-600"
                  disabled={disabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span className="text-[13px] font-semibold text-slate-800">{enabled ? "Ativa" : "Pausada"}</span>
              </span>
            </label>

            <label className="grid gap-1 rounded-xl border border-slate-200 bg-white/70 p-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Horario diario</span>
              <input
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-[13px] font-semibold text-slate-800 outline-none focus:border-red-300"
                disabled={disabled}
                onChange={(event) => setRunTimeLocal(event.target.value)}
                type="time"
                value={runTimeLocal}
              />
            </label>

            <label className="grid gap-1 rounded-xl border border-slate-200 bg-white/70 p-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Carencia trial</span>
              <input
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-[13px] font-semibold text-slate-800 outline-none focus:border-red-300"
                disabled={disabled}
                max={30}
                min={0}
                onChange={(event) => setTrialGraceDays(event.target.value)}
                type="number"
                value={trialGraceDays}
              />
            </label>

            <label className="grid gap-1 rounded-xl border border-slate-200 bg-white/70 p-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Limite por run</span>
              <input
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-[13px] font-semibold text-slate-800 outline-none focus:border-red-300"
                disabled={disabled}
                max={250}
                min={1}
                onChange={(event) => setMaxDeletionsPerRun(event.target.value)}
                type="number"
                value={maxDeletionsPerRun}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass("primary")}
              disabled={disabled || !dirty}
              onClick={saveSettings}
              type="button"
            >
              <Save className="h-3.5 w-3.5" />
              {running === "save" ? "Salvando" : "Salvar regra"}
            </button>
            <button
              className={buttonClass("ghost")}
              disabled={disabled}
              onClick={runDryRun}
              type="button"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              {running === "dry_run" ? "Testando" : "Testar sem excluir"}
            </button>
          </div>

          {notice ? (
            <p className={cn(
              "rounded-xl border px-3 py-2 text-[12px] font-semibold",
              notice.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : notice.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}>
              {notice.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-red-600" />
              <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Agenda</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoTile label="Agora" value={state.scheduler.currentLocalTime || "--:--"} />
              <InfoTile label="Proxima" value={state.scheduler.nextRunLabel} />
              <InfoTile label="Fuso" value={state.scheduler.timezone} />
              <InfoTile label="Devido" value={state.scheduler.dueNow ? "sim" : "nao"} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-red-600" />
              <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Ultima leitura</p>
            </div>
            {latestSummary ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoTile label="Candidatas" value={String(latestSummary.deleteCandidates)} />
                <InfoTile label="Arquivar" value={String(latestSummary.archivedMissingCandidates)} />
                <InfoTile label="Excluidas" value={String(latestSummary.deleted)} />
                <InfoTile label="Falhas" value={String(latestSummary.failed)} />
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-5 text-slate-500">Sem execucao registrada.</p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="truncate font-mono text-[8px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[12px] font-bold text-slate-800">{value}</p>
    </div>
  );
}

function buttonClass(tone: "primary" | "ghost") {
  return cn(
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 font-mono text-[10px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
    tone === "primary"
      ? "bg-red-600 text-white shadow-lg shadow-red-600/15 hover:bg-red-500"
      : "border border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-red-600",
  );
}
