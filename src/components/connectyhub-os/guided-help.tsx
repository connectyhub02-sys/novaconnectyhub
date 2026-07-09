"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Map, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type GuidedTourStep = {
  id: string;
  title: string;
  body: string;
  targetId?: string;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function HelpHint({
  title,
  children,
  className,
}: {
  title: string;
  children: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`Ajuda: ${title}`}
          className={cn(
            "inline-grid h-4 w-4 shrink-0 cursor-help place-items-center rounded-full border border-cyan-300/45 bg-cyan-300/10 text-cyan-100 outline-none transition hover:border-cyan-200 hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300/50",
            className,
          )}
          role="button"
          tabIndex={0}
        >
          <CircleHelp className="h-3 w-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-[260px] border border-cyan-300/20 bg-slate-950 px-3 py-2 text-[11px] leading-5 text-slate-100 shadow-2xl"
        side="top"
        sideOffset={8}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function GuidedTour({
  storageKey,
  steps,
  autoStart = true,
  launcherLabel = "Tour guiado",
  onStepChange,
}: {
  storageKey: string;
  steps: GuidedTourStep[];
  autoStart?: boolean;
  launcherLabel?: string;
  onStepChange?: (step: GuidedTourStep, index: number) => void;
}) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const completedStorageKey = `${storageKey}:done`;
  const step = steps[index] ?? steps[0];
  const hasSteps = steps.length > 0;
  const progressLabel = useMemo(() => `${Math.min(index + 1, steps.length)} de ${steps.length}`, [index, steps.length]);
  const targetStyle = useMemo(() => {
    if (!targetRect) return null;

    const top = Math.max(10, targetRect.top - 10);
    const left = Math.max(10, targetRect.left - 10);

    return {
      top,
      left,
      width: Math.min(window.innerWidth - left - 10, targetRect.width + 20),
      height: Math.min(window.innerHeight - top - 10, targetRect.height + 20),
    };
  }, [targetRect]);

  const finish = useCallback((done: boolean) => {
    setActive(false);
    setTargetRect(null);

    if (done) {
      try {
        window.localStorage.setItem(completedStorageKey, "1");
      } catch {
        // LocalStorage can be unavailable in private or restricted browser contexts.
      }
    }
  }, [completedStorageKey]);

  const start = useCallback(() => {
    if (!hasSteps) return;

    setIndex(0);
    setTargetRect(null);
    setActive(true);
  }, [hasSteps]);

  useEffect(() => {
    if (!autoStart || !hasSteps) return;

    const timeout = window.setTimeout(() => {
      try {
        const alreadyCompleted = window.localStorage.getItem(completedStorageKey) === "1";
        if (!alreadyCompleted) {
          setActive(true);
        }
      } catch {
        setActive(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [autoStart, completedStorageKey, hasSteps]);

  useEffect(() => {
    if (!active || !step) return;
    onStepChange?.(step, index);
  }, [active, index, onStepChange, step]);

  useEffect(() => {
    if (!active || !step?.targetId) {
      return;
    }

    let frame = 0;
    const updateRect = () => {
      const target = document.getElementById(step.targetId!);
      if (!target) {
        setTargetRect(null);
        return;
      }

      target.scrollIntoView({ block: "center", behavior: "smooth" });
      frame = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });
    };

    const timeout = window.setTimeout(updateRect, 80);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, step]);

  if (!hasSteps) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
        style={{ borderColor: "var(--ch-border)" }}
      >
        <Map className="h-3.5 w-3.5" />
        {launcherLabel}
      </button>

      {active && step ? (
        <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
          {targetStyle ? (
            <div
              className="fixed z-[1] rounded-2xl border-2 border-cyan-300 bg-cyan-300/5 shadow-[0_0_0_9999px_rgba(2,6,23,0.62),0_0_34px_rgba(34,211,238,0.48)]"
              style={targetStyle}
            >
              <span className="absolute -top-3 left-4 inline-flex min-h-6 items-center rounded-full border border-cyan-200/60 bg-cyan-300 px-2.5 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-950 shadow-lg">
                Olhe aqui
              </span>
            </div>
          ) : null}

          <div
            aria-modal="true"
            className="pointer-events-auto fixed bottom-4 left-4 right-4 z-[2] rounded-2xl border bg-slate-950 p-4 shadow-2xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[420px]"
            role="dialog"
            style={{ borderColor: "var(--ch-border-strong)" }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300">Tour guiado</p>
                <h2 className="text-[16px] font-bold leading-tight text-slate-50">{step.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => finish(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                style={{ borderColor: "var(--ch-border)" }}
                aria-label="Fechar tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-2 inline-flex items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-cyan-100">
              Area marcada em azul
            </p>
            <p className="text-[13px] leading-6 text-slate-300">{step.body}</p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                {progressLabel}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIndex((current) => Math.max(0, current - 1))}
                  disabled={index === 0}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Voltar
                </button>
                {index < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-300 px-3 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200"
                  >
                    Proximo
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => finish(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-300 px-3 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Finalizar
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => finish(true)}
              className="mt-3 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
            >
              Pular e nao mostrar de novo
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
