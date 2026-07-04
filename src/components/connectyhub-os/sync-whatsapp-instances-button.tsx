"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

export function SyncWhatsAppInstancesButton({
  variant = "card",
}: {
  variant?: "card" | "compact";
}) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ status: "idle", message: "" });

  async function handleSync() {
    setState({ status: "loading", message: "" });

    try {
      const response = await fetch("/api/admin/whatsapp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configureWebhooks: true }),
      });
      const data = await response.json().catch(() => null) as {
        summary?: {
          total: number;
          upserted: number;
          skipped: number;
          webhooksConfigured: number;
          webhookFailures: number;
        };
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel sincronizar as instancias.");
      }

      setState({
        status: "success",
        message: `${data?.summary?.upserted ?? 0}/${data?.summary?.total ?? 0} instancias salvas; ${data?.summary?.webhooksConfigured ?? 0} webhooks configurados.`,
      });
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Erro desconhecido ao sincronizar.",
      });
    }
  }

  const loading = state.status === "loading";
  const messageClass = state.status === "error"
    ? "text-rose-500"
    : state.status === "success"
      ? "text-emerald-400"
      : "text-slate-500";

  if (variant === "compact") {
    return (
      <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          Sincronizar Uazapi
        </button>
        {state.message ? (
          <p className={cn("max-w-[280px] text-right text-[10px] leading-4", messageClass)}>
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        Sincronizar Uazapi
      </button>
      {state.message ? (
        <p className={cn("mt-2 text-[11px] leading-4", messageClass)}>
          {state.message}
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Busca instancias no provedor, salva no Supabase e configura webhook por numero.
        </p>
      )}
    </div>
  );
}
