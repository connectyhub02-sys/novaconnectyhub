"use client";
import { useState } from "react";
import { filterInfrastructureCustomers, type InfrastructureCustomer } from "@/lib/infrastructure/customers";

export function InfrastructureCustomerPicker({ customers, value, onChange, currentName, disabled }: {
  customers: InfrastructureCustomer[]; value: string; onChange: (value: string) => void;
  currentName?: string | null; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = filterInfrastructureCustomers(customers, query);
  const selected = customers.find(c => c.id === value);
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 text-sm">
    <legend className="mb-2 font-medium">Cliente / empresa e titular</legend>
    <label className="block space-y-1">
      <span>Buscar cliente</span>
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, empresa ou e-mail"
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" />
    </label>
    <p role="status" className="text-xs text-slate-500">{matches.length} cliente(s) encontrado(s)</p>
    <div className="max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-slate-200">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2">
        <input type="radio" name="infra-customer" value="" checked={!value} onChange={() => onChange("")} />Sem vínculo
      </label>
      {matches.map(c => <label key={c.id} className={`flex min-h-14 cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 ${value === c.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
        <input type="radio" name="infra-customer" value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} />
        <span className="min-w-0 break-words"><strong className="block">{c.name}</strong><span className="block text-xs text-slate-600">{c.owner}{c.owner && c.email ? " · " : ""}{c.email}</span></span>
      </label>)}
      {!matches.length && <p className="p-3 text-slate-600">Nenhum cliente encontrado. Tente outro nome ou e-mail.</p>}
    </div>
    <p className="break-words rounded-lg bg-slate-50 p-2 text-xs">Selecionado: <strong>{value ? selected ? `${selected.name} · ${selected.owner || selected.email}` : currentName || "Vínculo atual" : "Sem vínculo"}</strong></p>
  </fieldset>;
}
