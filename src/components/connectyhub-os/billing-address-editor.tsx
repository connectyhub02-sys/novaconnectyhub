"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, MapPin } from "lucide-react";
import { brazilStates, emptyBillingAddress, parseBillingAddress, type BillingAddress } from "@/lib/billing/billing-address";
import { emptyBillingContact, parseBillingContact, type BillingContact } from "@/lib/billing/billing-contact";

type Suggestion = { id: string; source: string; address: Partial<BillingAddress>; contact: BillingContact };

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900";
export function BillingAddressEditor({ onReadyChange, subscriptionId }: { onReadyChange?: (ready: boolean) => void; subscriptionId?: string }) {
  const [address, setAddress] = useState<BillingAddress>(emptyBillingAddress);
  const [saved, setSaved] = useState<BillingAddress | null>(null);
  const [contact, setContact] = useState<BillingContact>(emptyBillingContact);
  const [savedContact, setSavedContact] = useState<BillingContact>(emptyBillingContact);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupFailed, setLookupFailed] = useState(false);
  const [message, setMessage] = useState("");
  const prefix = useId();
  const lookupVersion = useRef(0);
  const lastAutoCep = useRef("");
  const pendingCep = useRef("");
  const manualAddressFields = useRef(new Set<keyof BillingAddress>());
  const dirty = useRef(false);
  const profileVersion = useRef(0);
  const ready = !loading && Boolean(saved) && !editing;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const loadProfile = useCallback(async () => {
    const version = ++profileVersion.current;
    try {
      const response = await fetch("/api/dashboard/billing/address", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o endereço.");
      if (version !== profileVersion.current) return;
      const initial = data.address ? parseBillingAddress(data.address) : null;
      const draft: Suggestion | null = data.suggestion ?? null;
      setSuggestion(draft);
      if (dirty.current) { setMessage("Há dados de faturamento atualizados. Recarregue para revisar; sua edição foi preservada."); return; }
      lookupVersion.current++; pendingCep.current = ""; setLookingUp(false); setLookupMessage(""); setLookupFailed(false); manualAddressFields.current.clear();
      lastAutoCep.current = initial?.postalCode.replace(/\D/g, "") ?? "";
      const confirmedContact = { ...emptyBillingContact, ...data.contact };
      setUpdatedAt(data.updatedAt ?? null); setSavedContact(confirmedContact); setSaved(initial);
      setContact(!initial && draft ? { ...emptyBillingContact, ...draft.contact } : confirmedContact);
      setSuggestionId(!initial && draft ? draft.id : null);
      setAddress(initial ?? { ...emptyBillingAddress, ...draft?.address }); setEditing(!initial); setExpanded(!initial);
    } catch (error) { if (version === profileVersion.current) { setMessage(error instanceof Error ? error.message : "Não foi possível carregar os dados."); setEditing(true); setExpanded(true); } }
    finally { if (version === profileVersion.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void loadProfile();
    const refresh = (event: Event) => { if ((event as CustomEvent).detail?.source !== prefix) void loadProfile(); };
    window.addEventListener("connectyhub:billing-refresh", refresh);
    // This ref is a request sequence counter, not a DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { profileVersion.current++; window.removeEventListener("connectyhub:billing-refresh", refresh); };
  }, [loadProfile, prefix]);

  function reviewSuggestion() {
    if (!suggestion) return;
    const base = saved && saved.postalCode.replace(/\D/g, "") === suggestion.address.postalCode?.replace(/\D/g, "") ? saved : emptyBillingAddress;
    lookupVersion.current++; pendingCep.current = ""; lastAutoCep.current = base === saved ? base.postalCode.replace(/\D/g, "") : ""; manualAddressFields.current.clear();
    setLookingUp(false); setLookupMessage(""); setLookupFailed(false); dirty.current = true;
    setAddress({ ...base, ...suggestion.address }); setContact({ ...emptyBillingContact, ...suggestion.contact }); setSuggestionId(suggestion.id); setEditing(true); setExpanded(true); setMessage("");
  }

  const lookup = useCallback(async (retry = false) => {
    const cep = address.postalCode.replace(/\D/g, "");
    if (!/^\d{8}$/.test(cep)) { setLookupMessage("Informe um CEP com 8 dígitos."); return; }
    if (pendingCep.current === cep || (!retry && lastAutoCep.current === cep)) return;
    lastAutoCep.current = cep;
    pendingCep.current = cep;
    const version = ++lookupVersion.current;
    setLookingUp(true); setLookupFailed(false); setLookupMessage("Buscando endereço pelo CEP…");
    try {
      const response = await fetch(`/api/dashboard/billing/address/postal-code?cep=${cep}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível buscar o CEP. Preencha o endereço manualmente.");
      if (version !== lookupVersion.current) return;
      setAddress(current => {
        if (current.postalCode.replace(/\D/g, "") !== cep) return current;
        const next = { ...current };
        for (const key of ["street", "neighborhood", "city", "state"] as const) {
          if (!manualAddressFields.current.has(key) && data[key]) next[key] = data[key];
        }
        return next;
      });
      setLookupMessage("Endereço encontrado. Confira os dados e complete o número.");
    } catch (error) { if (version === lookupVersion.current) { setLookupFailed(true); setLookupMessage(error instanceof Error ? error.message : "Preencha o endereço manualmente."); } }
    finally { if (version === lookupVersion.current) { pendingCep.current = ""; setLookingUp(false); } }
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
    let next, nextContact;
    try { next = parseBillingAddress(address); nextContact = parseBillingContact(contact); }
    catch (error) { setMessage((error as Error).message); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/dashboard/billing/address", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...next, subscriptionId, contact: nextContact, expectedUpdatedAt: updatedAt, suggestionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o endereço.");
      const confirmed = parseBillingAddress(data.address);
      lookupVersion.current++; pendingCep.current = ""; dirty.current = false; setLookingUp(false); setAddress(confirmed); setSaved(confirmed); setSavedContact(data.contact ?? nextContact); setUpdatedAt(data.updatedAt ?? null); setEditing(false); setExpanded(false);
      if (suggestionId) { setSuggestion(null); setSuggestionId(null); }
      window.dispatchEvent(new CustomEvent("connectyhub:billing-refresh", { detail: { source: prefix } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o endereço."); }
    finally { setSaving(false); }
  }
  function update(key: keyof BillingAddress, value: string) {
    dirty.current = true;
    // Invalidate older CEPs; protect individual edits while a lookup is pending.
    if (key === "postalCode") { lookupVersion.current++; pendingCep.current = ""; setLookingUp(false); setLookupMessage(""); setLookupFailed(false); lastAutoCep.current = ""; manualAddressFields.current.clear(); }
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
    {suggestion ? <div className="mt-2 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-950">
      {suggestion.source === "checkout_recovery" ? <p>Dados recuperados de um checkout anterior. Eles podem diferir do titular informado na última troca de cartão.</p> : null}
      <p>{suggestionId ? "Dados informados no pagamento carregados para revisão. Confira titular, endereço e número antes de salvar." : "Há dados do titular informados em um pagamento ou cadastro de cartão. Seu faturamento confirmado foi preservado."}</p>
      {!suggestionId ? <button type="button" onClick={reviewSuggestion} className="min-h-11 font-semibold underline">Revisar dados informados</button> : null}
    </div> : null}
    {!editing && saved && (savedContact.name || savedContact.email || savedContact.phone || savedContact.cpfCnpj || savedContact.documentPreview) ? <p className="mt-2 text-xs leading-5 text-slate-600">{[savedContact.name, savedContact.email, savedContact.phone, savedContact.cpfCnpj ? `CPF/CNPJ ••••${savedContact.cpfCnpj.slice(-4)}` : savedContact.documentPreview].filter(Boolean).join(" · ")}</p> : null}
    {!expanded && !loading ? <p className="mt-1 text-xs leading-5 text-slate-500">{saved && editing ? "Há alterações não salvas. Abra para continuar." : saved ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{saved.street}, {saved.number} · {saved.city}/{saved.state}</span> : "Informe uma vez e reutilize nas próximas compras."}</p> : null}
    <div id={`${prefix}-fields`} hidden={!expanded}>
    {loading ? <p role="status" className="mt-3 text-sm text-slate-500">Carregando endereço…</p> : editing ? <>
      <fieldset disabled={saving} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {!subscriptionId || suggestionId ? <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-3">
          <p className="col-span-2 text-xs text-slate-500">Responsável pelo faturamento. Confirme se os dados do titular do cartão também devem ser usados nesta conta.</p>
          {([["name", "Nome do responsável"], ["email", "E-mail de faturamento"], ["cpfCnpj", "CPF/CNPJ de faturamento"], ["phone", "Telefone de faturamento"]] as const).map(([key,label]) => <label key={key} className="text-xs font-medium text-slate-700">{label}<input value={contact[key]} onChange={event => { dirty.current = true; setContact(current => ({ ...current, [key]: event.target.value })); }} className={fieldClass} type={key === "email" ? "email" : "text"} maxLength={key === "email" ? 254 : 120} /></label>)}
        </div> : null}
        <div className="col-span-2 sm:col-span-3">
          <label htmlFor={`${prefix}-postalCode`} className="block text-xs font-medium text-slate-700">CEP</label>
          <input id={`${prefix}-postalCode`} value={address.postalCode} onChange={event => { const digits = event.target.value.replace(/\D/g, "").slice(0,8); update("postalCode", digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void lookup(lookupFailed); } }} onBlur={() => { if (/^\d{8}$/.test(address.postalCode.replace(/\D/g, ""))) void lookup(); }} aria-describedby={`${prefix}-cep-status`} autoComplete="billing postal-code" inputMode="numeric" placeholder="00000-000" maxLength={9} className={`${fieldClass} min-w-0 max-w-48`} />
          <p id={`${prefix}-cep-status`} role="status" className="mt-1 text-xs leading-5 text-slate-500">{lookupMessage || "O endereço é buscado automaticamente ao completar o CEP."}</p>
          {lookupFailed ? <button type="button" onClick={() => void lookup(true)} disabled={lookingUp} className="min-h-11 text-xs font-semibold text-blue-700 underline underline-offset-4">Tentar novamente</button> : null}
        </div>
        {input("street", "Rua / logradouro", { autoComplete: "billing address-line1", maxLength: 160, wide: true })}
        {input("number", "Número", { maxLength: 6 })}
        {input("complement", "Complemento", { autoComplete: "billing address-line2", optional: true, maxLength: 120 })}
        {input("neighborhood", "Bairro")}
        {input("city", "Cidade", { autoComplete: "billing address-level2" })}
        <label htmlFor={`${prefix}-state`} className="block text-xs font-medium text-slate-700">UF<select id={`${prefix}-state`} value={address.state} onChange={event => update("state", event.target.value)} autoComplete="billing address-level1" className={fieldClass}><option value="">Selecione</option>{brazilStates.map(state => <option key={state}>{state}</option>)}</select></label>
        <div className="text-xs font-medium text-slate-700">País<p className="mt-1 flex min-h-11 items-center rounded-lg bg-slate-50 px-3 text-sm font-normal">Brasil</p></div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || lookingUp} onClick={() => void save()} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Salvando…" : subscriptionId ? "Salvar endereço e continuar" : "Salvar dados de faturamento"}</button>{saved ? <button type="button" disabled={saving} onClick={() => { lookupVersion.current++; pendingCep.current = ""; dirty.current = false; setLookingUp(false); setAddress(saved); setContact(savedContact); setSuggestionId(null); setEditing(false); setExpanded(false); setMessage(""); }} className="min-h-11 px-3 text-sm text-slate-600">Cancelar edição</button> : null}</div>
      {subscriptionId ? <p className="mt-2 text-xs text-slate-500">O pagamento será confirmado na próxima etapa.</p> : null}
    </> : saved ? <div className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><p>{saved.street}, {saved.number}{saved.complement ? ` · ${saved.complement}` : ""}<br />{saved.neighborhood} · {saved.city}/{saved.state}<br />CEP {saved.postalCode.replace(/^(\d{5})(\d{3})$/, "$1-$2")} · Brasil</p></div> : <button type="button" onClick={() => setEditing(true)} className="mt-2 min-h-11 text-sm text-blue-700">Preencher endereço</button>}
    {message ? <p role="status" className="mt-3 text-sm leading-5 text-slate-600">{message}</p> : null}
    {message && !saving ? <button type="button" className="min-h-11 text-xs font-semibold text-blue-700 underline" onClick={() => { dirty.current = false; setMessage(""); void loadProfile(); }}>Recarregar dados</button> : null}
    </div>
  </section>;
}
