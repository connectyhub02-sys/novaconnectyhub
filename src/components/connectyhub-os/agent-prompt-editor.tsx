"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PencilLine, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const maxPromptLength = 24000;

type EditorState =
  | { status: "idle"; message: string }
  | { status: "saving"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function AgentPromptEditor({
  agentId,
  agentName,
  currentPrompt,
  promptPreview,
}: {
  agentId: string;
  agentName: string;
  currentPrompt: string;
  promptPreview: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [savedPrompt, setSavedPrompt] = useState(currentPrompt);
  const [draftPrompt, setDraftPrompt] = useState(currentPrompt);
  const [savedPreview, setSavedPreview] = useState(promptPreview);
  const [state, setState] = useState<EditorState>({ status: "idle", message: "" });
  const remaining = maxPromptLength - draftPrompt.length;
  const isDirty = draftPrompt.trim() !== savedPrompt.trim();

  async function savePrompt() {
    const prompt = draftPrompt.trim();

    if (!prompt) {
      setState({ status: "error", message: "O prompt nao pode ficar vazio." });
      return;
    }

    if (prompt.length > maxPromptLength) {
      setState({ status: "error", message: "O prompt passou do limite." });
      return;
    }

    setState({ status: "saving", message: "Salvando prompt..." });

    try {
      const response = await fetch(`/api/admin/agents/${agentId}/prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        prompt?: string;
        promptPreview?: string;
      } | null;

      if (!response.ok) {
        setState({ status: "error", message: payload?.error ?? "Nao foi possivel salvar." });
        return;
      }

      const nextPrompt = payload?.prompt ?? prompt;
      setSavedPrompt(nextPrompt);
      setDraftPrompt(nextPrompt);
      setSavedPreview(payload?.promptPreview ?? buildPromptPreview(nextPrompt));
      setState({ status: "success", message: "Prompt salvo." });
      router.refresh();
    } catch {
      setState({ status: "error", message: "Falha de rede ao salvar." });
    }
  }

  function cancelEdit() {
    setDraftPrompt(savedPrompt);
    setOpen(false);
    setState({ status: "idle", message: "" });
  }

  return (
    <div className="mt-3 rounded-lg p-2.5" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Prompt base</p>
          <p
            className="mt-1 text-[11px] leading-4 text-slate-600"
            style={!open ? {
              display: "-webkit-box",
              overflow: "hidden",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            } : undefined}
          >
            {open ? "Edite o manual de trabalho deste agente." : savedPreview || "Prompt ainda nao definido."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setOpen((value) => !value)}
          className="border-violet-500/30 bg-violet-500/5 font-mono text-[9px] uppercase tracking-widest text-violet-700 hover:bg-violet-500/10"
        >
          {open ? <X className="h-3 w-3" /> : <PencilLine className="h-3 w-3" />}
          {open ? "Fechar" : "Editar prompt"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draftPrompt}
            rows={10}
            maxLength={maxPromptLength}
            aria-label={`Prompt do agente ${agentName}`}
            onChange={(event) => setDraftPrompt(event.target.value)}
            className="min-h-40 resize-y bg-white font-mono text-[12px] leading-5 text-slate-700"
            placeholder="Escreva aqui o prompt completo deste agente."
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={[
                "font-mono text-[9px] uppercase tracking-widest",
                state.status === "error" ? "text-rose-500" : "text-slate-500",
              ].join(" ")}
            >
              {state.message || `${remaining} caracteres restantes`}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!isDirty || state.status === "saving"}
                onClick={() => {
                  setDraftPrompt(savedPrompt);
                  setState({ status: "idle", message: "" });
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Reverter
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={state.status === "saving"}
                onClick={cancelEdit}
              >
                <X className="h-3 w-3" />
                Cancelar
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={!isDirty || state.status === "saving"}
                onClick={savePrompt}
                className="bg-[#01004c] text-white hover:bg-[#01004c]/90"
              >
                {state.status === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Salvar prompt
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPromptPreview(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}
