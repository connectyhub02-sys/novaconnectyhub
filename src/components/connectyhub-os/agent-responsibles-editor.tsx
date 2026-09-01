"use client";

import { Loader2, Plus, Send, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentResponsibleHumanInput = {
  name: string;
  phone: string;
  notifySales?: boolean;
  notifyPayments?: boolean;
  notifyOperational?: boolean;
};

export type ResponsibleHumanDraft = {
  id: string;
  name: string;
  phone: string;
};

type AgentResponsiblesEditorProps = {
  drafts: ResponsibleHumanDraft[];
  onChange: (drafts: ResponsibleHumanDraft[]) => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  testDisabled?: boolean;
  testLabel?: string;
  testing?: boolean;
  onTest?: () => void;
};

export function createResponsibleHumanDraft(
  input: Partial<ResponsibleHumanDraft> | Partial<AgentResponsibleHumanInput> = {},
): ResponsibleHumanDraft {
  return {
    id: "responsible-" + Math.random().toString(36).slice(2, 10),
    name: typeof input.name === "string" ? input.name : "",
    phone: typeof input.phone === "string" ? input.phone : "",
  };
}

export function toResponsibleHumanDrafts(value?: AgentResponsibleHumanInput[] | null) {
  const drafts = (value ?? [])
    .filter((item) => item.name?.trim() || item.phone?.trim())
    .map((item) => createResponsibleHumanDraft({
      name: item.name ?? "",
      phone: item.phone ?? "",
    }));

  return drafts.length > 0 ? drafts : [createResponsibleHumanDraft()];
}

export function responsibleHumansToPayload(drafts: ResponsibleHumanDraft[]): AgentResponsibleHumanInput[] {
  return drafts
    .map((draft) => ({
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      notifySales: true,
      notifyPayments: true,
      notifyOperational: true,
    }))
    .filter((draft) => draft.name || draft.phone);
}

export function firstResponsibleHumanPayload(drafts: ResponsibleHumanDraft[]) {
  return responsibleHumansToPayload(drafts)[0] ?? {
    name: "",
    phone: "",
    notifySales: true,
    notifyPayments: true,
    notifyOperational: true,
  };
}

export function isResponsibleHumansDraftComplete(drafts: ResponsibleHumanDraft[]) {
  const touchedDrafts = drafts.filter((draft) => draft.name.trim() || draft.phone.trim());

  return touchedDrafts.length > 0 && touchedDrafts.every((draft) => {
    const phoneDigits = draft.phone.replace(/\D+/g, "");
    return draft.name.trim().length >= 2 && phoneDigits.length >= 10;
  });
}

export function summarizeResponsibleHumans(
  responsibles?: AgentResponsibleHumanInput[] | null,
  fallback?: AgentResponsibleHumanInput | null,
) {
  const items = responsibleHumansToPayload(toResponsibleHumanDrafts(
    responsibles?.length ? responsibles : fallback?.phone ? [fallback] : [],
  ));

  if (items.length === 0) {
    return "Responsavel pendente";
  }

  if (items.length === 1) {
    return `${items[0].name || "Responsavel"} / ${items[0].phone}`;
  }

  return `${items.length} responsaveis: ${items
    .slice(0, 2)
    .map((item) => `${item.name || "Responsavel"} / ${item.phone}`)
    .join(", ")}${items.length > 2 ? "..." : ""}`;
}

export function AgentResponsiblesEditor({
  drafts,
  onChange,
  className,
  compact = false,
  disabled = false,
  testDisabled = false,
  testLabel = "Testar aviso",
  testing = false,
  onTest,
}: AgentResponsiblesEditorProps) {
  function updateDraft(id: string, patch: Partial<ResponsibleHumanDraft>) {
    onChange(drafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }

  function addDraft() {
    onChange([...drafts, createResponsibleHumanDraft()]);
  }

  function removeDraft(id: string) {
    const nextDrafts = drafts.filter((draft) => draft.id !== id);
    onChange(nextDrafts.length > 0 ? nextDrafts : [createResponsibleHumanDraft()]);
  }

  return (
    <div
      className={cn("rounded-xl border p-3", compact ? "space-y-2" : "space-y-3", className)}
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-cyan-300" />
            <p className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>
              Responsaveis humanos
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Todos os campos sao obrigatorios. Esses contatos recebem avisos de vendas, pagamentos e pedidos de intervencao.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onTest ? (
            <button
              className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[9px] font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || testDisabled || testing}
              type="button"
              onClick={onTest}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {testLabel}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 font-mono text-[9px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            type="button"
            onClick={addDraft}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {drafts.map((draft, index) => (
          <div key={draft.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[8px] uppercase tracking-widest text-slate-500">
                Responsavel {index + 1}
              </span>
              <input
                className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
                disabled={disabled}
                placeholder="Ex: Gerente comercial"
                value={draft.name}
                onChange={(event) => updateDraft(draft.id, { name: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[8px] uppercase tracking-widest text-slate-500">
                WhatsApp responsavel
              </span>
              <input
                className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
                disabled={disabled}
                placeholder="Ex: 5599999999999"
                value={draft.phone}
                onChange={(event) => updateDraft(draft.id, { phone: event.target.value })}
              />
            </label>
            <button
              aria-label={`Remover responsavel ${index + 1}`}
              className="mt-5 grid h-10 w-10 place-items-center rounded-lg border border-rose-400/25 bg-rose-400/10 text-rose-300 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40 md:mt-[21px]"
              disabled={disabled || drafts.length === 1}
              type="button"
              onClick={() => removeDraft(draft.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
