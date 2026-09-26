"use client";

import { useState } from "react";
import { Loader2, Megaphone, RefreshCcw, Sparkles, Users } from "lucide-react";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

export type TrafficRoutineState = {
  enabled: boolean; postStatus: boolean; targetIds: string[]; productMode: "featured" | "selected"; catalogItemIds: string[];
  idea: string; intensity: "light" | "normal" | "intense"; startHour: number;
  leadStatusView: boolean; leadStatusReact: boolean; leadStatusComment: boolean; plannedUntil: string | null; lastError: string | null;
};
export type TrafficPayload = {
  routine: TrafficRoutineState | null;
  upcoming: Array<{ id: string; kind: "status" | "grupos e canais"; title: string; text: string; scheduledFor: string | null }>;
  numbers?: Array<{ agentId: string; enabled: boolean }>;
};
type Target = { id: string; type: "group" | "newsletter"; name: string; participantCount: number | null; isAnnouncement: boolean | null; isAdmin: boolean | null };

const defaults: TrafficRoutineState = {
  enabled: false, postStatus: true, targetIds: [], productMode: "featured", catalogItemIds: [], idea: "", intensity: "normal", startHour: 9,
  leadStatusView: false, leadStatusReact: false, leadStatusComment: false, plannedUntil: null, lastError: null,
};
const intensities = [
  ["light", "Leve", "1 post por dia em cada lugar"],
  ["normal", "Normal", "2 posts por dia em cada lugar"],
  ["intense", "Intenso", "3 posts por dia em cada lugar"],
] as const;

/**
 * "Tráfego no WhatsApp": the owner picks where, what and how often, and turns it on. The system writes
 * the posts and plans every day by itself; the old detailed tools stay under "Mais opções".
 */
export function WhatsappTrafficRoutineCard(props: {
  traffic: TrafficPayload | null; targets: Target[]; products: ClientSalesCatalogItem[]; connected: boolean; disabled: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<TrafficPayload | null>; onDiscover: () => void; discovering: boolean;
  copySources?: Array<{ agentId: string; label: string }>;
}) {
  const saved = props.traffic?.routine ?? defaults;
  const [draft, setDraft] = useState<TrafficRoutineState>(saved);
  const [savedKey, setSavedKey] = useState(JSON.stringify(saved));
  const [saving, setSaving] = useState<string | null>(null);
  if (JSON.stringify(saved) !== savedKey) { setSavedKey(JSON.stringify(saved)); setDraft(saved); }
  const dirty = JSON.stringify({ ...draft, plannedUntil: null, lastError: null }) !== JSON.stringify({ ...saved, plannedUntil: null, lastError: null });
  const groups = props.targets.filter(target => target.type === "group");
  const channels = props.targets.filter(target => target.type === "newsletter");
  const places = (draft.postStatus ? 1 : 0) + draft.targetIds.length;
  const set = <K extends keyof TrafficRoutineState>(key: K, value: TrafficRoutineState[K]) => setDraft(current => ({ ...current, [key]: value }));
  const toggleId = (key: "targetIds" | "catalogItemIds", id: string) => setDraft(current => ({ ...current,
    [key]: current[key].includes(id) ? current[key].filter(value => value !== id) : [...current[key], id] }));

  async function save(enabled: boolean) {
    setSaving(enabled === saved.enabled ? "save" : enabled ? "on" : "off");
    await props.onSave("save_traffic_routine", { routine: { ...draft, enabled } });
    setSaving(null);
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Megaphone className="h-4 w-4 text-emerald-700" />Tráfego no WhatsApp</h3>
          <p className="mt-0.5 text-sm text-slate-600">Escolha onde, o quê e quantas vezes. O agente escreve os posts e planeja todos os dias sozinho.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", saved.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600")}>{saved.enabled ? "Rotina ligada" : "Rotina desligada"}</span>
          <button type="button" disabled={props.disabled || Boolean(saving) || (!saved.enabled && places === 0)} onClick={() => void save(!saved.enabled)}
            className={cn("rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50", saved.enabled ? "border border-slate-300 text-slate-700" : "bg-emerald-700 text-white")}>
            {saving === "on" || saving === "off" ? <Loader2 className="h-4 w-4 animate-spin" /> : saved.enabled ? "Desligar" : "Ligar rotina"}
          </button>
        </div>
      </div>
      {props.copySources?.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>Usar a mesma configuração de:</span>
          {props.copySources.map(source => (
            <button key={source.agentId} type="button" disabled={props.disabled || Boolean(saving)}
              onClick={async () => { setSaving("copy"); await props.onSave("copy_traffic_routine", { fromAgentId: source.agentId }); setSaving(null); }}
              className="rounded-full border border-emerald-600 px-2.5 py-1 font-semibold text-emerald-800 disabled:opacity-50">{saving === "copy" ? "Copiando…" : source.label}</button>
          ))}
          <span className="text-slate-500">Os grupos em comum já vêm marcados. Evite postar no mesmo grupo pelos dois números.</span>
        </div>
      ) : null}
      {!props.connected ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Conecte o WhatsApp deste agente para a rotina postar.</p> : null}
      {saved.lastError ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Último aviso da rotina: {saved.lastError}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Step number={1} title="Onde divulgar">
          <Check checked={draft.postStatus} onChange={() => set("postStatus", !draft.postStatus)} label="Meu status" hint="Aparece para todos os seus contatos" />
          <TargetList title="Meus grupos" icon={<Users className="h-3.5 w-3.5" />} items={groups} selected={draft.targetIds} onToggle={id => toggleId("targetIds", id)} />
          <TargetList title="Meus canais" icon={<Megaphone className="h-3.5 w-3.5" />} items={channels} selected={draft.targetIds} onToggle={id => toggleId("targetIds", id)} />
          <button type="button" disabled={props.disabled || props.discovering} onClick={props.onDiscover} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">
            {props.discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}Buscar meus grupos e canais
          </button>
        </Step>

        <Step number={2} title="O que divulgar">
          <Check radio checked={draft.productMode === "featured"} onChange={() => set("productMode", "featured")} label="Produtos em destaque" hint="Automático: os destaques da loja, variando a cada dia" />
          <Check radio checked={draft.productMode === "selected"} onChange={() => set("productMode", "selected")} label="Escolher produtos" hint="Só os que você marcar" />
          {draft.productMode === "selected" ? (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {props.products.filter(product => product.status === "active").slice(0, 40).map(product => (
                <button key={product.id} type="button" onClick={() => toggleId("catalogItemIds", product.id)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", draft.catalogItemIds.includes(product.id) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600")}>{product.title}</button>
              ))}
            </div>
          ) : null}
          <label className="block text-xs font-medium text-slate-600">Ideia ou oferta da semana (opcional)
            <textarea value={draft.idea} onChange={event => set("idea", event.target.value)} rows={3} maxLength={600} placeholder="Ex.: frete grátis até domingo, lançamento do sabor novo…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-800" />
          </label>
        </Step>

        <Step number={3} title="Quantas vezes">
          {intensities.map(([id, label, hint]) => <Check key={id} radio checked={draft.intensity === id} onChange={() => set("intensity", id)} label={label} hint={hint} />)}
          <label className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">Começar às
            <select value={draft.startHour} onChange={event => set("startHour", Number(event.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800">
              {Array.from({ length: 15 }, (_, index) => index + 6).map(hour => <option key={hour} value={hour}>{hour}h</option>)}
            </select>
          </label>
          <p className="text-xs text-slate-500">Os posts se espalham ao longo de 10 horas a partir desse horário.</p>
        </Step>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-emerald-700" />Interagir com os leads</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Check checked={draft.leadStatusView} onChange={() => set("leadStatusView", !draft.leadStatusView)} label="Ver o status dos leads" hint="Ser dos primeiros a visualizar quando eles postam" />
          <Check checked={draft.leadStatusReact} onChange={() => set("leadStatusReact", !draft.leadStatusReact)} label="Reagir com emoji" hint="Uma reação que combina com o que foi postado" />
          <Check checked={draft.leadStatusComment} onChange={() => set("leadStatusComment", !draft.leadStatusComment)} label="Comentar no status" hint="Um comentário curto e natural, que abre conversa" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Estas opções começam a agir assim que os status dos contatos chegarem ao sistema (em verificação com a UAZAPI). Comentar em muitos status aumenta o risco de bloqueio do número.</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!dirty || props.disabled || Boolean(saving)} onClick={() => void save(saved.enabled)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {saving === "save" ? "Salvando…" : "Salvar alterações"}
        </button>
        {saved.enabled && saved.plannedUntil ? <span className="text-xs text-slate-500">Planejado até {new Date(saved.plannedUntil).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span> : null}
      </div>

      {props.traffic?.upcoming.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-800">Próximos posts</p>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {props.traffic.upcoming.map(post => (
              <li key={post.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{post.scheduledFor ? new Date(post.scheduledFor).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "em breve"} · {post.kind}</span>
                  <button type="button" disabled={Boolean(saving)} onClick={async () => { setSaving(post.id); await props.onSave("skip_routine_post", { itemId: post.id }); setSaving(null); }}
                    className="font-semibold text-rose-700 disabled:opacity-50">{saving === post.id ? "…" : "Pular"}</button>
                </div>
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-slate-700">{post.text || post.title}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : saved.enabled ? <p className="mt-4 text-sm text-slate-500">Os próximos posts aparecem aqui assim que o agente terminar de planejar.</p> : null}
    </section>
  );
}

function Step(props: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2 rounded-lg border border-slate-200 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-700 text-[11px] text-white">{props.number}</span>{props.title}</p>
      {props.children}
    </div>
  );
}

function Check(props: { checked: boolean; onChange: () => void; label: string; hint?: string; radio?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm", props.checked ? "border-emerald-600 bg-emerald-50" : "border-slate-200")}>
      <input type={props.radio ? "radio" : "checkbox"} checked={props.checked} onChange={props.onChange} className="mt-0.5 accent-emerald-700" />
      <span><span className="block font-medium text-slate-800">{props.label}</span>{props.hint ? <span className="block text-xs text-slate-500">{props.hint}</span> : null}</span>
    </label>
  );
}

function TargetList(props: { title: string; icon: React.ReactNode; items: Target[]; selected: string[]; onToggle: (id: string) => void }) {
  if (!props.items.length) return <p className="flex items-center gap-1.5 text-xs text-slate-500">{props.icon}{props.title}: nenhum encontrado</p>;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">{props.icon}{props.title}</p>
      <div className="mt-1 grid max-h-44 gap-1 overflow-y-auto">
        {props.items.map(item => (
          <label key={item.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
            <span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={props.selected.includes(item.id)} onChange={() => props.onToggle(item.id)} className="accent-emerald-700" /><span className="truncate text-slate-800">{item.name}</span></span>
            <span className="shrink-0 text-xs text-slate-500">{item.isAnnouncement && item.isAdmin === false ? "só admins postam" : item.participantCount ? `${item.participantCount} membros` : ""}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
