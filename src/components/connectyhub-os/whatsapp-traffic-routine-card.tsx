"use client";

import { useState } from "react";
import { Loader2, Megaphone, MessagesSquare, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { CampaignEditor, campaignDestination, campaignFormatValue, destinationLabels, postFormats, trafficToday } from "./whatsapp-traffic-campaign-editor";
import { cn } from "@/lib/utils";
import { describeHolder, holderConflicts, type GroupHolder } from "@/lib/whatsapp/group-schedule";

export type TrafficNumberSettings = {
  leadStatusView: boolean; leadStatusReact: boolean; leadStatusComment: boolean;
  roomEnabled: boolean; roomTargetIds: string[]; roomOpenHour: number; roomCloseHour: number; roomDays: number[]; roomReplies: boolean;
  roomPlannedUntil: string | null; lastError: string | null;
};
export type TrafficCampaignView = {
  id: string; name: string; status: "active" | "paused" | "ended"; postStatus: boolean; targetIds: string[];
  productMode: "featured" | "selected" | "single"; catalogItemIds: string[]; idea: string; manualText: string;
  postFormat: "auto" | "product_audio" | "product_button" | "text" | "poll" | "carousel"; intensity: "light" | "normal" | "intense"; startHour: number;
  scheduleMode: "once" | "week" | "month" | "continuous"; endsAt: string | null; plannedUntil: string | null; lastError: string | null; sent: number; scheduled: number;
  startsAt?: string;
  carouselSize?: number | null; includeAudio?: boolean;
  statusAudience: "all" | "interested" | "customers" | "hot"; statusStyle: "single" | "story"; statusColor: number;
};
export type TrafficPayload = {
  routine: TrafficNumberSettings | null;
  campaigns: TrafficCampaignView[];
  upcoming: Array<{ id: string; kind: "status" | "grupos e canais" | "sala de dúvidas"; title: string; text: string; scheduledFor: string | null; campaign: string | null }>;
  numbers?: Array<{ agentId: string; enabled: boolean }>;
  groupHolders?: Record<string, GroupHolder>;
  agentEnabled?: boolean;
};
export type TrafficTarget = { id: string; type: "group" | "newsletter"; name: string; participantCount: number | null; isAnnouncement: boolean | null; isAdmin: boolean | null };
export type CampaignDraft = Omit<TrafficCampaignView, "id" | "status" | "endsAt" | "plannedUntil" | "lastError" | "sent" | "scheduled"> & { id: string | null; destination?: keyof typeof destinationLabels; startDate?: string };

const numberDefaults: TrafficNumberSettings = {
  leadStatusView: false, leadStatusReact: false, leadStatusComment: false, roomEnabled: false, roomTargetIds: [], roomOpenHour: 19, roomCloseHour: 20,
  roomDays: [0, 1, 2, 3, 4, 5, 6], roomReplies: true, roomPlannedUntil: null, lastError: null,
};
const newCampaign: CampaignDraft = {
  id: null, name: "", postStatus: true, targetIds: [], productMode: "featured", catalogItemIds: [], idea: "", manualText: "",
  postFormat: "auto", intensity: "normal", startHour: 9, scheduleMode: "week", statusAudience: "all", statusStyle: "single", statusColor: 13, carouselSize: 4, includeAudio: false,
};
const scheduleModes = [
  ["once", "Uma vez agora", "Um post só, em instantes"],
  ["week", "Diária por 7 dias", "Posts todos os dias por 7 dias"],
  ["month", "Diária por 30 dias", "Posts todos os dias por 30 dias"],
  ["continuous", "Contínua", "Até você pausar"],
] as const;
const statusAudiences = [
  ["all", "Todos os contatos"],
  ["interested", "Só interessados nos produtos da campanha"],
  ["customers", "Só clientes que já compraram"],
  ["hot", "Só leads quentes"],
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
  traffic: TrafficPayload | null; targets: TrafficTarget[]; products: ClientSalesCatalogItem[]; connected: boolean; disabled: boolean;
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

  const agentOff = props.traffic?.agentEnabled === false;
  return (
    <section className="grid gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      {agentOff ? (
        <p className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          Este agente está desativado. Ative o agente para usar campanhas e a sala de dúvidas: enquanto ele estiver desligado, nada é postado nem respondido.
        </p>
      ) : null}
      <div className={cn("grid gap-4", agentOff && "pointer-events-none select-none opacity-50 grayscale")} aria-disabled={agentOff || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Megaphone className="h-4 w-4 text-emerald-700" />Tráfego com IA</h3>
          <p className="mt-0.5 text-sm text-slate-600">Crie rotinas independentes para Status, Grupos e Canais. Cada uma tem seus produtos, horários e controle de pausa.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(["status", "groups", "channels"] as const).map(destination => (
          <button key={destination} type="button" disabled={props.disabled || Boolean(busy)}
            onClick={() => setEditor({ ...newCampaign, destination, postStatus: destination === "status", startDate: trafficToday() })}
            className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left hover:border-emerald-600 disabled:opacity-50">
            <span className="flex items-center justify-between font-semibold text-emerald-900">{destinationLabels[destination]}<Plus className="h-4 w-4" /></span>
            <span className="mt-1 block text-xs text-slate-600">{destination === "status" ? "Visibilidade, sequência, cores e produtos do seu Status." : destination === "groups" ? "Escolha grupos, produtos e formato, incluindo carrossel." : "Publicações para os seguidores dos seus canais."}</span>
            <span className="mt-3 block text-xs font-semibold text-emerald-700">Criar rotina de {destinationLabels[destination]}</span>
          </button>
        ))}
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
            const result = await run("save", "save_traffic_campaign", { campaignId: id, campaign: { ...campaign, ...(campaign.postFormat === "carousel" ? { carouselSize: campaign.carouselSize ?? 4, productMode: campaign.productMode === "single" ? "selected" : campaign.productMode } : {}) } });
            if (result) setEditor(null);
          }} />
      ) : null}

      {campaigns.length ? (
        <div className="grid gap-2">
          {campaigns.map(campaign => {
            const [statusText, statusClass] = statusStyle[campaign.status];
            const statusLabel = campaign.postStatus
              ? `Status${campaign.statusStyle === "story" ? " em sequência" : ""}${campaign.statusAudience !== "all" ? ` (${statusAudiences.find(([id]) => id === campaign.statusAudience)?.[1].replace("Só ", "") ?? ""})` : ""}`
              : null;
            const where = [destinationLabels[campaignDestination(campaign, props.targets)], statusLabel, ...campaign.targetIds.map(id => targetName.get(id) ?? "grupo/canal")].filter(Boolean);
            const what = campaign.productMode === "featured" ? "IA escolhe os produtos"
              : campaign.catalogItemIds.map(id => productName.get(id) ?? "produto").slice(0, 3).join(", ");
            return (
              <div key={campaign.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-900">{campaign.name}<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusClass)}>{statusText}</span></p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">{where.join(" · ")}</p>
                    {campaign.postFormat === "carousel" && <p className="text-xs font-medium text-emerald-800">{campaign.carouselSize ? `${campaign.carouselSize} produtos por carrossel` : "Até 4 produtos (rotina antiga; edite para definir a quantidade)"}</p>}
                    {campaign.includeAudio && <p className="text-xs text-emerald-800">Com áudio do agente após a publicação</p>}
                    <p className="text-xs text-slate-500">{what} · {campaign.postStatus && !campaign.targetIds.length ? campaign.statusStyle === "story" ? "Sequência de 3 Status" : "Status único" : formatLabel[campaignFormatValue(campaign)]} · {scheduleLabel[campaign.scheduleMode]}{campaign.scheduleMode !== "once" ? ` · ${intensities.find(item => item[0] === campaign.intensity)?.[2]}` : ""}{campaign.endsAt ? ` · até ${new Date(campaign.endsAt).toLocaleDateString("pt-BR")}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 text-xs text-slate-500">{campaign.sent} enviados · {campaign.scheduled} agendados</span>
                    {campaign.status !== "ended" ? (
                      <IconButton label={campaign.status === "active" ? "Pausar" : "Retomar"} busy={busy === `${campaign.id}:toggle`} disabled={props.disabled || Boolean(busy)}
                        onClick={() => void run(`${campaign.id}:toggle`, "campaign_status", { campaignId: campaign.id, campaignAction: campaign.status === "active" ? "pause" : "resume" })}>
                        {campaign.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </IconButton>
                    ) : null}
                    <IconButton label="Editar" disabled={props.disabled || Boolean(busy)} onClick={() => setEditor({ ...campaign, destination: campaignDestination(campaign, props.targets) })}><Pencil className="h-4 w-4" /></IconButton>
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
      ) : !editor ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">Escolha Status, Grupos ou Canais acima para criar sua primeira rotina.</p> : null}

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
      </div>
    </section>
  );
}

function NumberSettings(props: { saved: TrafficNumberSettings; groups: TrafficTarget[]; holders: Record<string, GroupHolder>; disabled: boolean; busy: string | null; onSave: (settings: TrafficNumberSettings, key: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(props.saved);
  const set = <K extends keyof TrafficNumberSettings>(key: K, value: TrafficNumberSettings[K]) => setDraft(current => ({ ...current, [key]: value }));
  const comparable = (value: TrafficNumberSettings) => JSON.stringify({ ...value, roomPlannedUntil: null, lastError: null, leadStatusView: false, leadStatusReact: false, leadStatusComment: false });
  const dirty = comparable(draft) !== comparable(props.saved);
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
                // One agent answers a group at a time: a group another agent answers in the chosen hours stays locked.
                const holder = props.holders[group.id];
                const conflict = holder ? holderConflicts(holder, { open: draft.roomOpenHour, close: draft.roomCloseHour, days: draft.roomDays }) : false;
                const locked = group.isAdmin === false || conflict;
                return (
                  <label key={group.id} title={holder ? (conflict ? `${describeHolder(holder)}: escolha outro horário ou dias, ou desligue a sala de ${holder.agentName} neste grupo` : describeHolder(holder)) : undefined}
                    className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm", locked ? "opacity-60" : "cursor-pointer hover:bg-slate-50")}>
                    <span className="flex min-w-0 items-center gap-2"><input type="checkbox" disabled={locked} checked={draft.roomTargetIds.includes(group.id)}
                      onChange={() => set("roomTargetIds", draft.roomTargetIds.includes(group.id) ? draft.roomTargetIds.filter(id => id !== group.id) : [...draft.roomTargetIds, group.id])} className="accent-emerald-700" /><span className="truncate text-slate-800">{group.name}</span></span>
                    {holder ? <span className={cn("shrink-0 text-xs", conflict ? "text-amber-700" : "text-slate-500")}>{describeHolder(holder)}</span> : group.isAdmin === false ? <span className="shrink-0 text-xs text-amber-700">precisa ser admin</span> : null}
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
            <p className="text-xs text-slate-500">Com o grupo fechado, ninguém escreve e o agente não responde. Para abrir e fechar, este número precisa ser admin do grupo. Só um agente responde em cada grupo por vez: grupos atendidos por outro agente em horário que cruza com o escolhido aparecem bloqueados (é preciso pelo menos 1 hora de intervalo entre as salas).</p>
          </div>
        </div>
        {props.saved.lastError ? <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{props.saved.lastError}</p> : null}
      </div>


      {dirty ? (
        <div className="flex justify-end">
          <button type="button" disabled={props.disabled || busy} onClick={() => void props.onSave(draft, "settings")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {props.busy === "settings" ? "Salvando…" : "Salvar sala"}
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

function Check(props: { checked: boolean; onChange: () => void; label: string; hint?: string; radio?: boolean; disabled?: boolean }) {
  return (
    <label className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm", props.disabled ? "cursor-not-allowed" : "cursor-pointer", props.checked ? "border-emerald-600 bg-emerald-50" : "border-slate-200")}>
      <input type={props.radio ? "radio" : "checkbox"} checked={props.checked} disabled={props.disabled} onChange={props.onChange} className="mt-0.5 accent-emerald-700" />
      <span><span className="block font-medium text-slate-800">{props.label}</span>{props.hint ? <span className="block text-xs text-slate-500">{props.hint}</span> : null}</span>
    </label>
  );
}
