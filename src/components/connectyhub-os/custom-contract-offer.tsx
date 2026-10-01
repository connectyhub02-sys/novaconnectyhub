"use client";
import { useState } from "react";
import type { ContractDevelopmentScope } from "@/lib/billing/contract-development";
import { ContractDevelopmentSummary } from "./contract-development-summary";

export function CustomContractOffer({ name, price, credits, planCode, developmentScope, version }: {
  name: string; price: number; credits: number; planCode: string;
  developmentScope?: ContractDevelopmentScope | null; version?: number;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="space-y-4 rounded-2xl border border-blue-300 bg-blue-50 p-5 text-slate-900">
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Condições individuais disponíveis{version ? ` · versão ${version}` : ""}</p>
      <h2 className="mt-2 text-xl font-bold">{name}</h2>
      <p className="mt-2 text-sm">{price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês · {credits.toLocaleString("pt-BR")} créditos por ciclo</p>
      {developmentScope && <p className="mt-2 text-sm text-slate-600">O valor mensal contempla os recursos da ConnectyHub e os serviços descritos abaixo.</p>}
    </div>
    <ContractDevelopmentSummary scope={developmentScope} title="Desenvolvimento previsto nas condições disponíveis" />
    <button disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50" onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/dashboard/billing/plan-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        window.location.assign(data.checkoutUrl);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível iniciar."); setBusy(false); }
    }}>{busy ? "Abrindo…" : "Conferir contrato e pagamento"}</button>
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    <p className="text-xs text-slate-600">O checkout apresenta a cobrança e as condições válidas antes da confirmação. Faturas já emitidas preservam os termos anteriores, inclusive o escopo do projeto.</p>
  </section>;
}
