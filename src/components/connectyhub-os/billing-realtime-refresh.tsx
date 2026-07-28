"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function BillingRealtimeRefresh({
  intervalMs = 15_000,
  updatedAt,
}: {
  intervalMs?: number;
  updatedAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clientUpdatedAt, setClientUpdatedAt] = useState<string | null>(null);
  const displayUpdatedAt = clientUpdatedAt ?? updatedAt;

  const refresh = useCallback(() => {
    setClientUpdatedAt(new Date().toISOString());
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }

    const intervalId = window.setInterval(refreshIfVisible, intervalMs);

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [intervalMs, refresh]);

  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-700 transition hover:bg-cyan-300/15"
      onClick={refresh}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", isPending ? "animate-spin" : "")} />
      Atualizado {formatRefreshTime(displayUpdatedAt)} / auto {Math.round(intervalMs / 1000)}s
    </button>
  );
}

function formatRefreshTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
