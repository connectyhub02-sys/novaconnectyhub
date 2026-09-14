"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FoodUnitEditor } from "./food-unit-editor";
import type { FoodCompositionPolicy, FoodUnitSelection } from "@/lib/sales-catalog/food-composition";
type Unit = { unitNumber: number; id: string; title: string; policy: FoodCompositionPolicy; selection: FoodUnitSelection };
type Quote = { revision: number; total: number | null; shipping: number | null };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function CheckoutFoodEditor({ sessionId }: { sessionId: string }) {
  const router = useRouter(), generation = useRef(0), requestId = useRef("");
  const [units, setUnits] = useState<Unit[] | null>(null), [quote, setQuote] = useState<Quote | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function action(action: "load" | "quote" | "save") {
    if (busy) return;
    setBusy(true); setError(null); const version = generation.current;
    try {
      if (action === "quote") requestId.current = crypto.randomUUID();
      const response = await fetch(`/api/checkout/${sessionId}/food`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, units: units?.map(unit => ({ id: unit.id, selection: unit.selection })), ...quote, requestId: requestId.current }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (version !== generation.current) return;
      if (action === "save") { setUnits(null); setQuote(null); router.refresh(); }
      else { setUnits(result.units); setQuote(action === "quote" ? result : null); }
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível atualizar a montagem."); }
    finally { setBusy(false); }
  }
  return <div className="my-3 space-y-3">
    {!units ? <button type="button" disabled={busy} className="min-h-11 text-sm font-medium text-emerald-700 underline" onClick={() => action("load")}>{busy ? "Carregando…" : "Alterar montagem e observações"}</button> : <fieldset disabled={busy} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-semibold">Montagem de cada unidade</legend>
      {units.map((unit, index) => <div key={unit.id}><p className="text-sm font-semibold">{unit.unitNumber ?? index + 1}. {unit.title}</p><FoodUnitEditor unitStartIndex={unit.unitNumber - 1} policy={unit.policy} quantity={1} value={[unit.selection]} onChange={value => { generation.current++; setQuote(null); setUnits(current => current!.map(row => row.id === unit.id ? { ...row, selection: value[0] } : row)); }}/></div>)}
      {quote?.total != null ? <div className="space-y-2 text-sm"><p>Entrega: {money(quote.shipping ?? 0)} · Novo total: <strong>{money(quote.total)}</strong></p><p className="text-xs text-slate-600">Ao confirmar, os pagamentos anteriores em aberto serão substituídos pelo valor atualizado.</p><button type="button" className="min-h-11 w-full rounded-lg bg-emerald-800 px-3 font-semibold text-white" onClick={() => action("save")}>Confirmar montagem e total</button></div> : <button type="button" className="min-h-11 w-full rounded-lg bg-emerald-800 px-3 text-sm font-semibold text-white" onClick={() => action("quote")}>Conferir novo total</button>}
      <button type="button" className="min-h-11 text-sm text-slate-600" onClick={() => { generation.current++; setUnits(null); setQuote(null); }}>Voltar sem alterar</button>
    </fieldset>}
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
  </div>;
}
