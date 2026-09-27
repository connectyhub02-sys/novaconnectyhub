"use client";

import { useState } from "react";
import { Loader2, Megaphone, MessagesSquare, Pause, Pencil, Play, Plus, RefreshCcw, Sparkles, Trash2, Users, X } from "lucide-react";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

export type TrafficNumberSettings = {
  leadStatusView: boolean; leadStatusReact: boolean; leadStatusComment: boolean;
  roomEnabled: boolean; roomTargetIds: string[]; roomOpenHour: number; roomCloseHour: number; roomDays: number[]; roomReplies: boolean;
  roomPlannedUntil: string | null; lastError: string | null;
};
export type TrafficCampaignView = {
  id: string; name: string; status: "active" | "paused" | "ended"; postStatus: boolean; targetIds: string[];
  productMode: "featured" | "selected" | "single"; catalogItemIds: string[]; idea: string; manualText: string;
  postFormat: "auto" | "product_audio" | "product_button" | "text" | "poll"; intensity: "light" | "normal" | "intense"; startHour: number;
  scheduleMode: "once" | "week" | "month" | "continuous"; endsAt: string | null; plannedUntil: string | null; lastError: string | null; sent: number; scheduled: number;
};
export type TrafficPayload = {
  routine: TrafficNumberSettings | null;
  campaigns: TrafficCampaignView[];
  upcoming: Array<{ id: string; kind: "status" | "grupos e canais" | "sala de dúvidas"; title: string; text: string; scheduledFor: string | null; campaign: string | null }>;
  numbers?: Array<{ agentId: string; enabled: boolean }>;
  groupHolders?: Record<string, string>;
};
type Target = { id: string; type: "group" | "newsletter"; name: string; participantCount: number | null; isAnnouncement: boolean | null; isAdmin: boolean | null };
type CampaignDraft = Omit<TrafficCampaignView, "id" | "status" | "endsAt" | "plannedUntil" | "lastError" | "sent" | "scheduled"> & { id: string | null };

const numberDefaults: TrafficNumberSettings = {
  leadStatusView: false, leadStatusReact: false, leadStatusComment: false, roomEnabled: false, roomTargetIds: [], roomOpenHour: 19, roomCloseHour: 20,
  roomDays: [0, 1, 2, 3, 4, 5, 6], roomReplies: true, roomPlannedUntil: null, lastError: null,
};
const newCampaign: CampaignDraft = {
  id: null, name: "", postStatus: true, targetIds: [], productMode: "featured", catalogItemIds: [], idea: "", manualText: "",
  postFormat: "auto", intensity: "normal", startHour: 9, scheduleMode: "week",
};
const productModes = [
  ["featured", "IA escolhe", "Os destaques da loja, variando a cada dia"],
  ["single", "Um produto só", "A campanha inteira sobre um produto"],
  ["selected", "Alguns produtos", "Só os que você marcar"],
] as const;
const postFormats = [
  ["auto", "Automático", "A IA varia: texto, carrossel, enquete e áudio"],
  ["product_audio", "Produto com botão + áudio", "Foto, botão para ver e comprar e um áudio do agente explicando o produto"],
  ["product_button", "Produto com botão", "Foto e botão para ver e comprar, sem áudio"],
  ["text", "Só texto", "Mensagens curtas que puxam conversa"],
  ["poll", "Enquete", "Pergunta com opções (só em grupos)"],
] as const;
const scheduleModes = [
  ["once", "Uma vez agora", "Um post só, em instantes"],
  ["week", "Por 1 semana", "Posts todos os dias por 7 dias"],
  ["month", "Por 1 mês", "Posts todos os dias por 30 dias"],
  ["continuous", "Contínua", "Até você pausar"],
] as const;
const intensities = [["light", "Leve", "1 por dia"], ["normal", "Normal", "2 por dia"], ["intense", "Intenso", "3 por dia"]] as const;
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const formatLabel = Object.fromEntries(postFormats.map(([id, label]) => [id, label])) as Record<string, string>;
const scheduleLabel = Object.fromEntries(scheduleModes.map(([id, label]) => [id, label])) as Record<string, string>;
const statusStyle = { active: ["Ligada", "bg-emerald-100 text-emerald-800"], paused: ["Pausada", "bg-amber-100 text-amber-800"], ended: ["Encerrada", "bg-slate-100 text-slate-600"] } as const;
const shortDate = (value: string) => new Date(value).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * "Tráfego com IA": each number has its campaigns (where, what, how and when), the question room in groups
 * and the interaction with the leads' status. The AI writes the posts and plans each day by itself.
 */
export function WhatsappTrafficRoutineCard(props: {
  traffic: TrafficPayload | null; targets: Target[]; products: ClientSalesCatalogItem[]; connected: boolean; disabled: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<TrafficPayload | null>; onDiscover: () => void; discovering: boolean;
  copySources?: Array<{ agentId: string; label: string }>;
}) {
  const [editor, setEditor] = useState<CampaignDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const campaigns = props.traffic?.campaigns ?? [];
  const groups = props.targets.filter(target => target.type === "group");
  const channels = props.targets.filter(target => target.type === "newsletter");
  const targetName = new Map(props.targets.map(target => [target.id, target.name]));
  const productName = new Map(props.products.map(product => [product.id, product.title]));

  async function run(key: string, action: string, payload: Record<string, unknown>) {
    setBusy(key);
    const result = await props.onSave(action, payload);
    setBusy(null);
    return result;
  }

  return (
    <section className="grid gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Megaphone className="h-4 w-4 text-emerald-700" />Tráfego com IA</h3>
          <p className="mt-0.5 text-sm text-slate-600">Crie campanhas para o status, grupos e canais. O agente escreve os posts e planeja cada dia sozinho.</p>
        </div>
        <button type="button" disabled={props.disabled} onClick={() => setEditor({ ...newCampaign })} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Plus className="h-4 w-4" />Nova campanha
        </button>
      </div>
      {!props.connected ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Conecte o WhatsApp deste agente para as campanhas postarem.</p> : null}
      {props.copySources?.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>Copiar campanhas e sala de:</span>
          {props.copySources.map(source => (
            <button key={source.agentId} type="button" disabled={props.disabled || Boolean(busy)} onClick={() => void run("copy", "copy_traffic_routine", { fromAgentId: source.agentId })}
              className="rounded-full border border-emerald-600 px-2.5 py-1 font-semibold text-emerald-800 disabled:opacity-50">{busy === "copy" ? "Copiando…" : source.label}</button>
          ))}
          <span className="text-slate-500">Chegam pausadas. Evite postar no mesmo grupo pelos dois números.</span>
        </div>
      ) : null}

      {editor ? (
        <CampaignEditor draft={editor} setDraft={setEditor} groups={groups} channels={channels} products={props.products} busy={busy === "save"}
          discovering={props.discovering} onDiscover={props.onDiscover}
          onSave={async () => {
            const { id, ...campaign } = editor;
            const result = await run("save", "save_traffic_campaign", { campaignId: id, campaign });
            if (result) setEditor(null);
          }} />
      ) : null}

      {campaigns.length ? (
        <div className="grid gap-2">
          {campaigns.map(campaign => {
            const [statusText, statusClass] = statusStyle[campaign.status];
            const where = [campaign.postStatus ? "Status" : null, ...campaign.targetIds.map(id => targetName.get(id) ?? "grupo/canal")].filter(Boolean);
            const what = campaign.productMode === "featured" ? "IA escolhe os produtos"
              : campaign.catalogItemIds.map(id => productName.get(id) ?? "produto").slice(0, 3).join(", ");
            return (
              <div key={campaign.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-900">{campaign.name}<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusClass)}>{statusText}</span></p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">{where.join(" · ")}</p>
                    <p className="text-xs text-slate-500">{what} · {formatLabel[campaign.postFormat]} · {scheduleLabel[campaign.scheduleMode]}{campaign.scheduleMode !== "once" ? ` · ${intensities.find(item => item[0] === campaign.intensity)?.[2]}` : ""}{campaign.endsAt ? ` · até ${new Date(campaign.endsAt).toLocaleDateString("pt-BR")}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 text-xs text-slate-500">{campaign.sent} enviados · {campaign.scheduled} agendados</span>
                    {campaign.status !== "ended" ? (
                      <IconButton label={campaign.status === "active" ? "Pausar" : "Retomar"} busy={busy === `${campaign.id}:toggle`} disabled={props.disabled || Boolean(busy)}
                        onClick={() => void run(`${campaign.id}:toggle`, "campaign_status", { campaignId: campaign.id, campaignAction: campaign.status === "active" ? "pause" : "resume" })}>
                        {campaign.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </IconButton>
                    ) : null}
                    <IconButton label="Editar" disabled={props.disabled || Boolean(busy)} onClick={() => setEditor({ ...campaign })}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label="Excluir" busy={busy === `${campaign.id}:delete`} disabled={props.disabled || Boolean(busy)}
                      onClick={() => { if (window.confirm(`Excluir a campanha "${campaign.name}"? Os posts agendados dela serão cancelados.`)) void run(`${campaign.id}:delete`, "campaign_status", { campaignId: campaign.id, campaignAction: "delete" }); }}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
                {campaign.lastError ? <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{campaign.lastError}</p> : null}
              </div>
            );
          })}
        </div>
      ) : !editor ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">Nenhuma campanha ainda. Clique em &quot;Nova campanha&quot; para começar.</p> : null}

      <NumberSettings key={JSON.stringify(props.traffic?.routine ?? null)} saved={props.traffic?.routine ?? numberDefaults} groups={groups} holders={props.traffic?.groupHolders ?? {}} disabled={props.disabled}
        busy={busy} onSave={(settings, key) => run(key, "save_traffic_routine", { routine: settings })} />

      {props.traffic?.upcoming.length ? (
        <div>
          <p className="text-sm font-semibold text-slate-800">Próximos envios</p>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {props.traffic.upcoming.map(post => (
              <li key={post.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{post.scheduledFor ? shortDate(post.scheduledFor) : "em breve"} · {post.campaign ?? post.kind}</span>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(post.id, "skip_routine_post", { itemId: post.id })} className="font-semibold text-rose-700 disabled:opacity-50">{busy === post.id ? "…" : "Pular"}</button>
                </div>
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-slate-700">{post.text || post.title}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CampaignEditor(props: {
  draft: CampaignDraft; setDraft: (value: CampaignDraft | null) => void; groups: Target[]; channels: Target[]; products: ClientSalesCatalogItem[];
  busy: boolean; discovering: boolean; onDiscover: () => void; onSave: () => void;
}) {
  const { draft } = props;
  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => props.setDraft({ ...draft, [key]: value });
  const toggle = (key: "targetIds" | "catalogItemIds", id: string) => set(key, draft[key].includes(id) ? draft[key].filter(value => value !== id) : [...draft[key], id]);
  const activeProducts = props.products.filter(product => product.status === "active");
  const ready = (draft.postStatus || draft.targetIds.length > 0) && (draft.productMode === "featured" || draft.catalogItemIds.length > 0);
  return (
    <div className="rounded-xl border-2 border-emerald-600/40 bg-emerald-50/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <input value={draft.name} onChange={event => set("name", event.target.value)} maxLength={80} placeholder="Nome da campanha (ex.: Semana do Whey)"
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800" />
        <button type="button" aria-label="Fechar" onClick={() => props.setDraft(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <Step number={1} title="Onde">
          <Check checked={draft.postStatus} onChange={() => set("postStatus", !draft.postStatus)} label="Meu status" hint="Aparece para todos os contatos" />
          <TargetList title="Grupos" icon={<Users className="h-3.5 w-3.5" />} items={props.groups} selected={draft.targetIds} onToggle={id => toggle("targetIds", id)} />
          <TargetList title="Canais" icon={<Megaphone className="h-3.5 w-3.5" />} items={props.channels} selected={draft.targetIds} onToggle={id => toggle("targetIds", id)} />
          <button type="button" disabled={props.discovering} onClick={props.onDiscover} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">
            {props.discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}Buscar meus grupos e canais
          </button>
        </Step>
        <Step number={2} title="O quê">
          {productModes.map(([id, label, hint]) => <Check key={id} radio checked={draft.productMode === id} onChange={() => props.setDraft({ ...draft, productMode: id, catalogItemIds: id === "single" ? draft.catalogItemIds.slice(0, 1) : draft.catalogItemIds })} label={label} hint={hint} />)}
          {draft.productMode === "single" ? (
            <select value={draft.catalogItemIds[0] ?? ""} onChange={event => set("catalogItemIds", event.target.value ? [event.target.value] : [])} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="">Escolha o produto</option>
              {activeProducts.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}
            </select>
          ) : draft.productMode === "selected" ? (
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {activeProducts.slice(0, 40).map(product => (
                <button key={product.id} type="button" onClick={() => toggle("catalogItemIds", product.id)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", draft.catalogItemIds.includes(product.id) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600")}>{product.title}</button>
              ))}
            </div>
          ) : null}
          <label className="block text-xs font-medium text-slate-600">Ideia ou oferta (opcional)
            <textarea value={draft.idea} onChange={event => set("idea", event.target.value)} rows={2} maxLength={600} placeholder="Ex.: frete grátis até domingo"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800" />
          </label>
        </Step>
        <Step number={3} title="Como">
          {postFormats.map(([id, label, hint]) => <Check key={id} radio checked={draft.postFormat === id} onChange={() => set("postFormat", id)} label={label} hint={hint} />)}
        </Step>
        <Step number={4} title="Quando">
          {scheduleModes.map(([id, label, hint]) => <Check key={id} radio checked={draft.scheduleMode === id} onChange={() => set("scheduleMode", id)} label={label} hint={hint} />)}
          {draft.scheduleMode === "once" ? (
            <label className="block text-xs font-medium text-slate-600">Seu texto (opcional)
              <textarea value={draft.manualText} onChange={event => set("manualText", event.target.value)} rows={3} maxLength={1500} placeholder="Deixe vazio para a IA escrever"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800" />
            </label>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {intensities.map(([id, label, hint]) => (
                  <button key={id} type="button" onClick={() => set("intensity", id)} className={cn("rounded-full border px-2.5 py-1 text-xs", draft.intensity === id ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600")}>{label} · {hint}</button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">Começar às
                <select value={draft.startHour} onChange={event => set("startHour", Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800">
                  {Array.from({ length: 15 }, (_, index) => index + 6).map(hour => <option key={hour} value={hour}>{hour}h</option>)}
                </select>
              </label>
            </>
          )}
        </Step>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={() => props.setDraft(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancelar</button>
        <button type="button" disabled={!ready || props.busy} onClick={props.onSave} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {props.busy ? "Salvando…" : draft.id ? "Salvar campanha" : draft.scheduleMode === "once" ? "Postar" : "Ligar campanha"}
        </button>
      </div>
    </div>
  );
}

function NumberSettings(props: { saved: TrafficNumberSettings; groups: Target[]; holders: Record<string, string>; disabled: boolean; busy: string | null; onSave: (settings: TrafficNumberSettings, key: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(props.saved);
  const set = <K extends keyof TrafficNumberSettings>(key: K, value: TrafficNumberSettings[K]) => setDraft(current => ({ ...current, [key]: value }));
  const dirty = JSON.stringify({ ...draft, roomPlannedUntil: null, lastError: null }) !== JSON.stringify({ ...props.saved, roomPlannedUntil: null, lastError: null });
  const busy = Boolean(props.busy);
  return (
    <>
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><MessagesSquare className="h-4 w-4 text-emerald-700" />Sala de dúvidas nos grupos</p>
            <p className="text-xs text-slate-500">O agente abre o grupo no horário, avisa, responde e fecha avisando quando abre de novo.</p>
          </div>
          <button type="button" disabled={props.disabled || busy || (!props.saved.roomEnabled && draft.roomTargetIds.length === 0)} onClick={() => void props.onSave({ ...draft, roomEnabled: !props.saved.roomEnabled }, "room")}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50", props.saved.roomEnabled ? "border border-slate-300 text-slate-700" : "bg-emerald-700 text-white")}>
            {props.busy === "room" ? <Loader2 className="h-4 w-4 animate-spin" /> : props.saved.roomEnabled ? "Desligar sala" : "Ligar sala"}
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-600">Quais grupos</p>
            <div className="mt-1 grid max-h-44 gap-1 overflow-y-auto">
              {props.groups.length ? props.groups.map(group => {
                // Only one agent answers in each group: a group another agent answers stays locked here.
                const holder = props.holders[group.id];
                const locked = group.isAdmin === false || Boolean(holder);
                return (
                  <label key={group.id} title={holder ? `Para trocar, desligue a sala de ${holder} neste grupo` : undefined}
                    className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm", locked ? "opacity-60" : "cursor-pointer hover:bg-slate-50")}>
                    <span className="flex min-w-0 items-center gap-2"><input type="checkbox" disabled={locked} checked={draft.roomTargetIds.includes(group.id)}
                      onChange={() => set("roomTargetIds", draft.roomTargetIds.includes(group.id) ? draft.roomTargetIds.filter(id => id !== group.id) : [...draft.roomTargetIds, group.id])} className="accent-emerald-700" /><span className="truncate text-slate-800">{group.name}</span></span>
                    {holder ? <span className="shrink-0 text-xs text-amber-700">atendido por {holder}</span> : group.isAdmin === false ? <span className="shrink-0 text-xs text-amber-700">precisa ser admin</span> : null}
                  </label>
                );
              }) : <p className="text-xs text-slate-500">Nenhum grupo encontrado.</p>}
            </div>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-xs font-semibold text-slate-600">Horário</p>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              Abre às
              <select value={draft.roomOpenHour} onChange={event => { const open = Number(event.target.value); setDraft(current => ({ ...current, roomOpenHour: open, roomCloseHour: Math.max(current.roomCloseHour, open + 1) })); }} className="rounded-lg border border-slate-200 px-2 py-1">
                {Array.from({ length: 17 }, (_, index) => index + 6).map(hour => <option key={hour} value={hour}>{hour}h</option>)}
              </select>
              fecha às
              <select value={draft.roomCloseHour} onChange={event => set("roomCloseHour", Number(event.target.value))} className="rounded-lg border border-slate-200 px-2 py-1">
                {Array.from({ length: 23 - draft.roomOpenHour }, (_, index) => draft.roomOpenHour + 1 + index).map(hour => <option key={hour} value={hour}>{hour}h</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-1">
              {weekdays.map((label, day) => (
                <button key={label} type="button" onClick={() => set("roomDays", draft.roomDays.includes(day) ? draft.roomDays.filter(value => value !== day) : [...draft.roomDays, day].sort())}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", draft.roomDays.includes(day) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500")}>{label}</button>
              ))}
            </div>
            {props.saved.roomEnabled && props.saved.roomPlannedUntil ? <p className="text-xs text-slate-500">Próxima sala planejada até {shortDate(props.saved.roomPlannedUntil)}</p> : null}
          </div>
          <div className="grid content-start gap-2">
            <Check checked={draft.roomReplies} onChange={() => set("roomReplies", !draft.roomReplies)} label="O agente responde as perguntas"
              hint="Enquanto o grupo está aberto, responde em texto ou áudio (como no atendimento) citando quem perguntou" />
            <p className="text-xs text-slate-500">Com o grupo fechado, ninguém escreve e o agente não responde. Para abrir e fechar, este número precisa ser admin do grupo. Só um agente responde em cada grupo: grupos já atendidos por outro agente aparecem bloqueados.</p>
          </div>
        </div>
        {props.saved.lastError ? <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{props.saved.lastError}</p> : null}
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-emerald-700" />Interagir com os leads</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Check checked={draft.leadStatusView} onChange={() => set("leadStatusView", !draft.leadStatusView)} label="Ver o status dos leads" hint="Visualizar logo que postam: o lead vê seu número entre os primeiros" />
          <Check checked={draft.leadStatusReact} onChange={() => set("leadStatusReact", !draft.leadStatusReact)} label="Reagir ao status do lead" hint="Um emoji que combina com o que ele postou" />
          <Check checked={draft.leadStatusComment} onChange={() => set("leadStatusComment", !draft.leadStatusComment)} label="Comentar no status do lead" hint="Chega no privado dele como resposta ao status e abre conversa" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Tudo aqui acontece no status dos seus leads. A cada 5 minutos o agente confere os status no ar (inclusive os postados antes de você ligar) e age aos poucos, com limite de 200 visualizações, 40 reações e 20 comentários por dia. Comentário: no máximo 1 por lead por dia e nunca logo depois de outra mensagem. Comentar muito aumenta o risco de bloqueio do número.</p>
      </div>

      {dirty ? (
        <div className="flex justify-end">
          <button type="button" disabled={props.disabled || busy} onClick={() => void props.onSave(draft, "settings")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {props.busy === "settings" ? "Salvando…" : "Salvar sala e interação"}
          </button>
        </div>
      ) : null}
    </>
  );
}

function IconButton(props: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={props.label} aria-label={props.label} disabled={props.disabled} onClick={props.onClick} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
      {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : props.children}
    </button>
  );
}

function Step(props: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
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
      <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto">
        {props.items.map(item => (
          <label key={item.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
            <span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={props.selected.includes(item.id)} onChange={() => props.onToggle(item.id)} className="accent-emerald-700" /><span className="truncate text-slate-800">{item.name}</span></span>
            <span className="shrink-0 text-xs text-slate-500">{item.isAnnouncement && item.isAdmin === false ? "só admins postam" : item.participantCount ? `${item.participantCount}` : ""}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
