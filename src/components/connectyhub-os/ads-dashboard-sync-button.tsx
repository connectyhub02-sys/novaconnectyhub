"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, RefreshCcw } from "lucide-react";
import type { Tone } from "@/lib/connectyhub-os-data";
import { cn } from "@/lib/utils";
import { toneClass } from "./panel-primitives";

type SyncProvider = "meta" | "google";
type SyncState = "idle" | "loading" | "success" | "warning" | "error";

type MetaSyncResult = {
  ok: boolean;
  permission: string;
  detail: string;
};

type MetaSyncResponse = {
  ok?: boolean;
  summary?: string;
  results?: MetaSyncResult[];
  error?: string;
};

export function AdsDashboardSyncButton({
  label = "Sincronizar",
  refreshingLabel = "Sincronizando",
  successLabel = "Atualizado",
  provider = "google",
  tone = "cyan",
}: {
  label?: string;
  refreshingLabel?: string;
  successLabel?: string;
  provider?: SyncProvider;
  tone?: Tone;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const t = toneClass(resolveTone(state, tone));
  const loading = state === "loading" || isPending;
  const displayLabel = getDisplayLabel({
    label,
    loading,
    message,
    refreshingLabel,
    state,
    successLabel,
  });

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  function queueTimer(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function clearTimers() {
    for (const timer of timers.current) {
      window.clearTimeout(timer);
    }
    timers.current = [];
  }

  async function handleRefresh() {
    if (loading) return;

    clearTimers();
    setState("loading");
    setMessage(null);
    setDetail(null);

    try {
      if (provider === "meta") {
        const body = await runMetaSync();
        const results = body.results ?? [];
        const successCount = results.filter((result) => result.ok).length;
        const total = results.length || 3;
        const syncMessage = `${successCount}/${total} OK`;

        if (body.ok) {
          setState("success");
          setMessage(syncMessage);
          setDetail(body.summary ?? "Fontes Meta sincronizadas e validadas.");
        } else {
          const failed = results.filter((result) => !result.ok);
          setState("warning");
          setMessage(`${syncMessage}: ${formatFailedLabel(failed)}`);
          setDetail(formatFailedDetail(failed, body.summary));
        }
      } else {
        setState("success");
        setMessage(successLabel);
        setDetail("Dashboard recarregado. O endpoint de sincronizacao Google fica para a proxima fase tecnica.");
      }

      startTransition(() => {
        router.refresh();
      });

      queueTimer(() => {
        setState("idle");
        setMessage(null);
        setDetail(null);
      }, 5000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Nao foi possivel sincronizar agora.";
      setState("error");
      setMessage("Falhou");
      setDetail(errorMessage);

      queueTimer(() => {
        setState("idle");
        setMessage(null);
        setDetail(null);
      }, 6500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      title={detail ?? "Sincroniza as fontes conectadas e atualiza os mostradores do dashboard."}
      aria-busy={loading}
      aria-live="polite"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition disabled:cursor-wait disabled:opacity-80",
        t.border,
        t.bg,
        t.text,
      )}
    >
      {state === "success" && !isPending ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : state === "warning" || state === "error" ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
      )}
      <span>{displayLabel}</span>
    </button>
  );
}

async function runMetaSync() {
  const response = await fetch("/api/dashboard/integrations/meta/review-test", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null) as MetaSyncResponse | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "A Meta nao aceitou a sincronizacao.");
  }

  return body ?? {};
}

function getDisplayLabel({
  label,
  loading,
  message,
  refreshingLabel,
  state,
  successLabel,
}: {
  label: string;
  loading: boolean;
  message: string | null;
  refreshingLabel: string;
  state: SyncState;
  successLabel: string;
}) {
  if (loading) return refreshingLabel;
  if (state === "success") return message ?? successLabel;
  if (state === "warning") return message ?? "Aviso";
  if (state === "error") return message ?? "Falhou";

  return label;
}

function formatFailedLabel(results: MetaSyncResult[]) {
  if (!results.length) return "Meta";
  if (results.length > 1) return `${results.length} pendencias`;

  return shortPermissionName(results[0]?.permission);
}

function formatFailedDetail(results: MetaSyncResult[], fallback?: string) {
  if (!results.length) {
    return fallback ?? "A Meta retornou pendencia sem detalhar a permissao.";
  }

  return results
    .map((result) => `${shortPermissionName(result.permission)}: ${result.detail}`)
    .join(" | ");
}

function shortPermissionName(permission: string) {
  if (permission === "business_management") return "Business";
  if (permission === "ads_read") return "Ads";
  if (permission === "pages_read_engagement") return "Pagina";

  return permission;
}

function resolveTone(state: SyncState, fallback: Tone): Tone {
  if (state === "success") return "green";
  if (state === "warning") return "amber";
  if (state === "error") return "rose";

  return fallback;
}
