"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCcw } from "lucide-react";
import type { Tone } from "@/lib/connectyhub-os-data";
import { cn } from "@/lib/utils";
import { toneClass } from "./panel-primitives";

type SyncState = "idle" | "loading" | "success";

export function AdsDashboardSyncButton({
  label = "Sincronizar",
  refreshingLabel = "Sincronizando",
  successLabel = "Atualizado",
  tone = "cyan",
}: {
  label?: string;
  refreshingLabel?: string;
  successLabel?: string;
  tone?: Tone;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<SyncState>("idle");
  const timers = useRef<number[]>([]);
  const t = toneClass(tone);
  const loading = state === "loading" || isPending;

  useEffect(() => {
    return () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  function queueTimer(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function handleRefresh() {
    for (const timer of timers.current) {
      window.clearTimeout(timer);
    }
    timers.current = [];
    setState("loading");

    startTransition(() => {
      router.refresh();
    });

    queueTimer(() => {
      setState("success");
      queueTimer(() => setState("idle"), 2600);
    }, 900);
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
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
      ) : (
        <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
      )}
      <span>{loading ? refreshingLabel : state === "success" ? successLabel : label}</span>
    </button>
  );
}
