"use client";
import { useId, useState } from "react";
import type { PublicAiModel } from "@/lib/ai-api/model-catalog";
import { aiCapabilityLabels } from "@/lib/ai-api/model-labels";

export function AiModelPicker({ models }: { models: PublicAiModel[] }) {
  const id = useId();
  const [choice, setChoice] = useState("flash-3.5");
  const selected = models.find(model => model.id === choice && model.available) ?? models.find(model => model.available && model.family === "text") ?? models.find(model => model.available);
  return <div className="min-w-0 w-full space-y-3">
    <label htmlFor={id} className="text-sm font-semibold">Modelo desta chave</label>
    <select id={id} name="modelId" required value={selected?.id ?? ""} disabled={!selected}
      onChange={event => setChoice(event.target.value)}
      className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
      {!selected && <option value="">Nenhum modelo liberado no momento</option>}
      <optgroup label="Disponíveis">{models.filter(model=>model.available).map(model => <option key={model.id} value={model.id}>{model.name}{model.recommended ? " · Recomendado" : ""}</option>)}</optgroup>
      {models.some(model=>!model.available)&&<optgroup label="Em preparação" disabled>{models.filter(model=>!model.available).map(model=><option key={model.id} value={model.id}>{model.name}</option>)}</optgroup>}
    </select>
    {selected && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap gap-2 text-sm"><strong>{selected.name}</strong>{selected.recommended && <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">Recomendado</span>}</div>
      <p className="text-sm leading-6 text-slate-700">{selected.profile}</p>
      <p className="text-sm text-slate-700">Consumo em créditos: {selected.consumption.toLowerCase()}.</p>
      <div className="flex flex-wrap gap-2">{selected.capabilities.map(capability => <span key={capability} className="rounded-lg bg-white px-2 py-1 text-xs text-blue-900">{aiCapabilityLabels[capability] ?? capability}</span>)}</div>
      <p className="text-xs leading-6 text-slate-600">Esta chave usará o modelo selecionado. Para usar outro modelo, crie outra chave. O consumo real depende da solicitação.</p>
    </div>}
  </div>;
}
