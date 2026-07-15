"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, RefreshCcw } from "lucide-react";
import type { Tone } from "@/lib/connectyhub-os-data";
import { cn } from "@/lib/utils";
import { toneClass } from "./panel-primitives";

type ReviewTestResult = {
  id: string;
  label: string;
  ok: boolean;
  permission: string;
  status: number | null;
  detail: string;
  endpoint: string;
};

type ReviewTestResponse = {
  ok?: boolean;
  summary?: string;
  results?: ReviewTestResult[];
  error?: string;
};

type ButtonState = "idle" | "loading" | "success" | "warning" | "error";

export function MetaReviewTestButton({
  label = "Testar conexao",
  tone = "violet",
}: {
  label?: string;
  tone?: Tone;
}) {
  const [state, setState] = useState<ButtonState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const t = toneClass(resolveTone(state, tone));
  const loading = state === "loading";
  const displayLabel = getDisplayLabel(state, label, message);

  async function handleClick() {
    setState("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/dashboard/integrations/meta/review-test", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null) as ReviewTestResponse | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Nao foi possivel testar a conexao Meta.");
      }

      const results = body?.results ?? [];
      const successCount = results.filter((result) => result.ok).length;
      const total = results.length || 3;

      if (body?.ok) {
        setState("success");
        setMessage(`${successCount}/${total} OK`);
      } else {
        setState("warning");
        setMessage(`${successCount}/${total} OK`);
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Teste Meta falhou.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={message ?? "Executa chamadas reais na Graph API para validar a conexao Meta."}
      aria-live="polite"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition disabled:cursor-wait disabled:opacity-80",
        t.border,
        t.bg,
        t.text,
      )}
    >
      <StateIcon state={state} />
      <span>{displayLabel}</span>
    </button>
  );
}

function StateIcon({ state }: { state: ButtonState }) {
  if (state === "loading") {
    return <RefreshCcw className="h-4 w-4 animate-spin" />;
  }

  if (state === "success") {
    return <CheckCircle2 className="h-4 w-4" />;
  }

  if (state === "warning" || state === "error") {
    return <AlertTriangle className="h-4 w-4" />;
  }

  return <FlaskConical className="h-4 w-4" />;
}

function getDisplayLabel(state: ButtonState, fallback: string, message: string | null) {
  if (state === "loading") return "Testando";
  if (state === "success") return message ?? "Conexao OK";
  if (state === "warning") return message ?? "Pendente";
  if (state === "error") return "Falhou";

  return fallback;
}

function resolveTone(state: ButtonState, fallback: Tone): Tone {
  if (state === "success") return "green";
  if (state === "warning") return "amber";
  if (state === "error") return "rose";

  return fallback;
}
