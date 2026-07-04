"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerAgentAction = {
  id: string;
  name: string;
};

type ActionResponse = {
  ok?: boolean;
  error?: {
    message?: string;
  };
};

export function AdminCustomerWhatsappActions({
  agents,
  instanceId,
  instanceLabel,
}: {
  agents: CustomerAgentAction[];
  instanceId: string;
  instanceLabel: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<"instance" | "agent" | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null,
    [agents, selectedAgentId],
  );

  async function runAction(payload: Record<string, unknown>, runningKey: "instance" | "agent") {
    setRunning(runningKey);

    try {
      const response = await fetch("/api/admin/clientes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message ?? "Acao nao concluida.");
      }

      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setRunning(null);
    }
  }

  function deleteInstance() {
    const confirmed = window.confirm(
      `Excluir a instancia WhatsApp de "${instanceLabel}"?\n\nA conexao sera removida do painel e tambem da Uazapi para evitar cobranca duplicada.`,
    );

    if (!confirmed) return;

    void runAction({ action: "delete_instance", instanceId }, "instance");
  }

  function deleteAgent() {
    if (!selectedAgent) return;

    const confirmed = window.confirm(
      `Excluir o agente "${selectedAgent.name}"?\n\nQualquer instancia WhatsApp vinculada a ele tambem sera removida da Uazapi antes da exclusao.`,
    );

    if (!confirmed) return;

    void runAction({ action: "delete_agent", agentId: selectedAgent.id }, "agent");
  }

  return (
    <div className="min-w-[180px] space-y-2">
      <button
        className={actionButtonClass("danger")}
        disabled={running !== null}
        onClick={deleteInstance}
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {running === "instance" ? "Excluindo" : "Instancia"}
      </button>

      {agents.length > 0 ? (
        <div className="grid gap-1">
          {agents.length > 1 ? (
            <select
              className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 font-mono text-[10px] uppercase text-slate-300 outline-none"
              disabled={running !== null}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              value={selectedAgentId}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            className={actionButtonClass("warning")}
            disabled={running !== null || !selectedAgent}
            onClick={deleteAgent}
            type="button"
          >
            <UserRound className="h-3.5 w-3.5" />
            {running === "agent" ? "Excluindo" : "Agente"}
          </button>
        </div>
      ) : (
        <p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">sem agente</p>
      )}
    </div>
  );
}

function actionButtonClass(tone: "danger" | "warning") {
  return cn(
    "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border px-2 font-mono text-[10px] font-semibold uppercase transition disabled:cursor-not-allowed disabled:opacity-60",
    tone === "danger"
      ? "border-rose-300/25 bg-rose-300/10 text-rose-200 hover:bg-rose-300/15"
      : "border-amber-300/25 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15",
  );
}
