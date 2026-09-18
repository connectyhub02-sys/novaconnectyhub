"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, MapPin } from "lucide-react";
import { brazilStates, emptyBillingAddress, parseBillingAddress, type BillingAddress } from "@/lib/billing/billing-address";

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900";
export function BillingAddressEditor({ onReadyChange, subscriptionId }: { onReadyChange?: (ready: boolean) => void; subscriptionId?: string }) {
  const [address, setAddress] = useState<BillingAddress>(emptyBillingAddress);
  const [saved, setSaved] = useState<BillingAddress | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [message, setMessage] = useState("");
  const prefix = useId();
  const lookupVersion = useRef(0);
  const lastAutoCep = useRef("");
  const manualAddressFields = useRef(new Set<keyof BillingAddress>());
  const ready = !loading && Boolean(saved) && !editing;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  useEffect(() => {
    let disposed = false;
    void fetch("/api/dashboard/billing/address", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o endereço.");
      if (disposed) return;
      const initial = data.address ? parseBillingAddress(data.address) : null;
      lastAutoCep.current = initial?.postalCode.replace(/\D/g, "") ?? "";
      setSaved(initial); setAddress(initial ?? emptyBillingAddress); setEditing(!initial); setExpanded(!initial);
    }).catch(error => { if (!disposed) { setMessage(error.message); setEditing(true); setExpanded(true); } }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);

  const lookup = useCallback(async () => {
    const cep = address.postalCode.replace(/\D/g, "");
    if (!/^\d{8}$/.test(cep)) { setMessage("Informe um CEP com 8 dígitos."); return; }
    lastAutoCep.current = cep;
    const version = ++lookupVersion.current;
    setLookingUp(true); setMessage("Buscando endereço pelo CEP…");
    try {
      const response = await fetch(`/api/dashboard/billing/address/postal-code?cep=${cep}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (version !== lookupVersion.current) return;
      setAddress(current => {
        if (current.postalCode.replace(/\D/g, "") !== cep) return current;
        const next = { ...current };
        for (const key of ["street", "neighborhood", "city", "state"] as const) {
          if (!manualAddressFields.current.has(key) && data[key]) next[key] = data[key];
        }
        return next;
      });
      setMessage("Confira o endereço encontrado e complete o número.");
    } catch (error) { if (version === lookupVersion.current) setMessage(error instanceof Error ? error.message : "Preencha o endereço manualmente."); }
    finally { if (version === lookupVersion.current) setLookingUp(false); }
  }, [address.postalCode]);
  useEffect(() => {
    const cep = address.postalCode.replace(/\D/g, "");
    if (loading || !editing || !/^\d{8}$/.test(cep) || lastAutoCep.current === cep) return;
    const timer = window.setTimeout(() => {
      if (lastAutoCep.current !== cep) void lookup();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [address.postalCode, editing, loading, lookup]);
  useEffect(() => () => { lookupVersion.current++; }, []);
  async function save() {
    if (saving) return;
    let next;
    try { next = parseBillingAddress(address); }
    catch (error) { setMessage((error as Error).message); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/dashboard/billing/address", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...next, subscriptionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o endereço.");
      const confirmed = parseBillingAddress(data.address);
      lookupVersion.current++; setLookingUp(false); setAddress(confirmed); setSaved(confirmed); setEditing(false); setExpanded(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o endereço."); }
    finally { setSaving(false); }
  }
  function update(key: keyof BillingAddress, value: string) {
    // Invalidate older CEPs; protect individual edits while a lookup is pending.
    if (key === "postalCode") { lookupVersion.current++; setLookingUp(false); lastAutoCep.current = ""; manualAddressFields.current.clear(); }
    else manualAddressFields.current.add(key);
    setAddress(current => ({ ...current, [key]: value })); setMessage("");
  }
  const input = (key: keyof BillingAddress, label: string, options: { autoComplete?: string; maxLength?: number; wide?: boolean; optional?: boolean } = {}) => <label className={`block text-xs font-medium text-slate-700 ${options.wide ? "col-span-2" : ""}`} htmlFor={`${prefix}-${key}`}>
    {label}{options.optional ? <span className="font-normal text-slate-500"> (opcional)</span> : null}
    <input id={`${prefix}-${key}`} className={fieldClass} value={address[key]} required={!options.optional} autoComplete={options.autoComplete} maxLength={options.maxLength ?? 100} onChange={event => update(key, event.target.value)} />
  </label>;
  return <section aria-label="Endereço de faturamento" className="mt-4 border-t border-slate-200 pt-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">{subscriptionId ? <span className="ch-checkout-step">2</span> : <MapPin className="h-4 w-4" />}Endereço de faturamento</h3>
      {saved && !editing ? <button type="button" aria-expanded={expanded} aria-controls={`${prefix}-fields`} onClick={() => { setExpanded(true); setEditing(true); }} className="flex min-h-11 shrink-0 items-center gap-1 px-1 text-xs font-semibold text-blue-700">Editar<ChevronDown aria-hidden="true" className="h-4 w-4" /></button> : !loading && subscriptionId ? <span className="text-xs font-medium text-slate-500">Obrigatório</span> : null}
    </div>
    {!expanded && !loading ? <p className="mt-1 text-xs leading-5 text-slate-500">{saved && editing ? "Há alterações não salvas. Abra para continuar." : saved ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{saved.street}, {saved.number} · {saved.city}/{saved.state}</span> : "Informe uma vez e reutilize nas próximas compras."}</p> : null}
    <div id={`${prefix}-fields`} hidden={!expanded}>
    {loading ? <p role="status" className="mt-3 text-sm text-slate-500">Carregando endereço…</p> : editing ? <>
      <fieldset disabled={saving} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3"><label htmlFor={`${prefix}-postalCode`} className="block text-xs font-medium text-slate-700">CEP</label><div className="flex gap-2"><input id={`${prefix}-postalCode`} value={address.postalCode} onChange={event => { const digits = event.target.value.replace(/\D/g, "").slice(0,8); update("postalCode", digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits); }} autoComplete="billing postal-code" inputMode="numeric" placeholder="00000-000" maxLength={9} className={`${fieldClass} min-w-0 max-w-48`} /><button type="button" onClick={() => void lookup()} disabled={lookingUp} className="mt-1 min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700">{lookingUp ? "Buscando…" : "Buscar CEP"}</button></div></div>
        {input("street", "Rua / logradouro", { autoComplete: "billing address-line1", maxLength: 160, wide: true })}
        {input("number", "Número", { maxLength: 6 })}
        {input("complement", "Complemento", { autoComplete: "billing address-line2", optional: true, maxLength: 120 })}
        {input("neighborhood", "Bairro")}
        {input("city", "Cidade", { autoComplete: "billing address-level2" })}
        <label htmlFor={`${prefix}-state`} className="block text-xs font-medium text-slate-700">UF<select id={`${prefix}-state`} value={address.state} onChange={event => update("state", event.target.value)} autoComplete="billing address-level1" className={fieldClass}><option value="">Selecione</option>{brazilStates.map(state => <option key={state}>{state}</option>)}</select></label>
        <div className="text-xs font-medium text-slate-700">País<p className="mt-1 flex min-h-11 items-center rounded-lg bg-slate-50 px-3 text-sm font-normal">Brasil</p></div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || lookingUp} onClick={() => void save()} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Salvando…" : subscriptionId ? "Salvar endereço e continuar" : "Salvar endereço"}</button>{saved ? <button type="button" disabled={saving} onClick={() => { lookupVersion.current++; setLookingUp(false); setAddress(saved); setEditing(false); setExpanded(false); setMessage(""); }} className="min-h-11 px-3 text-sm text-slate-600">Cancelar edição</button> : null}</div>
      {subscriptionId ? <p className="mt-2 text-xs text-slate-500">O pagamento será confirmado na próxima etapa.</p> : null}
    </> : saved ? <div className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><p>{saved.street}, {saved.number}{saved.complement ? ` · ${saved.complement}` : ""}<br />{saved.neighborhood} · {saved.city}/{saved.state}<br />CEP {saved.postalCode.replace(/^(\d{5})(\d{3})$/, "$1-$2")} · Brasil</p></div> : <button type="button" onClick={() => setEditing(true)} className="mt-2 min-h-11 text-sm text-blue-700">Preencher endereço</button>}
    {message ? <p role="status" className="mt-3 text-sm leading-5 text-slate-600">{message}</p> : null}
    </div>
  </section>;
}
