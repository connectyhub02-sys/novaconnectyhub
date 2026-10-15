"use client";

import { useState } from "react";
import { RefreshCcw, X } from "lucide-react";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";
import type { CampaignDraft, TrafficTarget } from "./whatsapp-traffic-routine-card";

export const postFormats = [
  ["auto", "Automático", "A IA escolhe o formato de cada publicação."],
  ["carousel", "Carrossel com botões", "Cartões com mídia e botão, sem áudio adicional."],
  ["carousel_audio", "Carrossel com botões + áudio", "Após o carrossel, o agente envia um áudio apresentando os mesmos produtos dos cartões."],
  ["product_audio", "Produto com botão + áudio", "Foto e botão do produto, acompanhados de um áudio explicativo."],
  ["product_button", "Produto com botão", "Foto, legenda e botão para abrir o produto, sem áudio."],
  ["text", "Só texto", "Mensagem curta para iniciar uma conversa."],
  ["text_audio", "Texto + áudio", "Após o texto, o agente envia a mensagem também em áudio."],
  ["poll", "Enquete", "Pergunta com opções de resposta. Disponível nos grupos."],
  ["poll_audio", "Enquete + áudio", "Após a enquete, o agente envia um áudio apresentando a pergunta e as opções e convidando a votar."],
] as const;

const audioFormats = { carousel_audio: "carousel", text_audio: "text", poll_audio: "poll" } as const;
export function campaignFormatValue(campaign: Pick<CampaignDraft, "postFormat" | "includeAudio">) {
  return campaign.includeAudio && ["carousel", "text", "poll"].includes(campaign.postFormat)
    ? `${campaign.postFormat}_audio` : campaign.postFormat;
}
function parseFormat(value: string): Pick<CampaignDraft, "postFormat" | "includeAudio"> {
  if (value in audioFormats) return { postFormat: audioFormats[value as keyof typeof audioFormats], includeAudio: true };
  return { postFormat: value as CampaignDraft["postFormat"], includeAudio: false };
}

export const destinationLabels = { status: "Status", groups: "Grupos", channels: "Canais", mixed: "Vários destinos (rotina existente)" };
export function campaignDestination(campaign: { postStatus: boolean; targetIds: string[] }, targets: TrafficTarget[]): keyof typeof destinationLabels {
  if (campaign.postStatus && !campaign.targetIds.length) return "status";
  if (campaign.postStatus) return "mixed";
  const selected = targets.filter(t => campaign.targetIds.includes(t.id));
  if (selected.length !== campaign.targetIds.length) return "mixed";
  if (selected.length && selected.every(t => t.type === "newsletter")) return "channels";
  if (selected.length && selected.every(t => t.type === "group")) return "groups";
  return "mixed";
}
export const trafficToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const schedules = [["once", "Uma vez agora"], ["week", "Todos os dias, por 7 dias"], ["month", "Todos os dias, por 30 dias"], ["continuous", "Todos os dias, até pausar"]] as const;
const colors = [[13, "Magenta", "#a3176a"], [8, "Azul", "#1f5fbf"], [4, "Verde", "#1ea55a"], [3, "Laranja", "#f29a1d"], [12, "Roxo", "#5b4bb5"], [7, "Azul claro", "#28a9c9"], [15, "Salmão", "#e8826f"], [19, "Cinza", "#3b4550"]] as const;
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100";

export function CampaignEditor(props: {
  draft: CampaignDraft; setDraft: (draft: CampaignDraft | null) => void;
  groups: TrafficTarget[]; channels: TrafficTarget[]; products: ClientSalesCatalogItem[];
  busy: boolean; discovering: boolean; onDiscover: () => void; onSave: () => void;
}) {
  const { draft } = props;
  const [search, setSearch] = useState("");
  const destination = draft.destination ?? campaignDestination(draft, [...props.groups, ...props.channels]);
  const isStatus = destination === "status";
  const isMixed = destination === "mixed";
  const targets = destination === "groups" ? props.groups : destination === "channels" ? props.channels : [...props.groups, ...props.channels];
  const activeProducts = props.products.filter(p => p.status === "active");
  const hasMedia = (p: ClientSalesCatalogItem) => p.media.some(m => ["image", "video", "document"].includes(m.kind) && /^https?:\/\//i.test(m.storageUrl ?? ""));
  const carousel = !isStatus && draft.postFormat === "carousel";
  const carouselSize = draft.carouselSize ?? 4;
  const manualProducts = draft.productMode === "selected" || (carousel && draft.productMode === "single");
  const formatValue = campaignFormatValue(draft);
  const productLimit = carousel ? carouselSize : 12;
  const destinationReady = draft.postStatus || draft.targetIds.length > 0;
  const productReady = draft.productMode === "featured" ? !carousel || activeProducts.filter(hasMedia).length >= carouselSize
    : (carousel ? new Set(draft.catalogItemIds).size === carouselSize : draft.catalogItemIds.length > 0) && draft.catalogItemIds.every(id => activeProducts.some(p => p.id === id && (!carousel || hasMedia(p))));
  const ready = destinationReady && productReady && draft.catalogItemIds.length <= 12 && draft.targetIds.length <= 50;
  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => props.setDraft({ ...draft, [key]: value });
  const toggle = (key: "targetIds" | "catalogItemIds", id: string) => set(key, draft[key].includes(id) ? draft[key].filter(v => v !== id) : [...draft[key], id]);
  const formats = postFormats.filter(([id]) => {
    const { postFormat } = parseFormat(id);
    return postFormat === "carousel" ? destination === "groups" : postFormat !== "poll" || destination === "groups" || isMixed;
  });
  return (
    <div className="rounded-xl border-2 border-emerald-600/40 bg-emerald-50/30 p-4" data-testid="traffic-editor">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-emerald-900">Rotina de {destinationLabels[destination]}</h4>
          <p className="mt-1 text-xs text-slate-600">{isMixed ? "Esta rotina antiga compartilha conteúdo e programação entre destinos. Para separar, crie novas rotinas e pause esta quando estiver pronto." : "Conteúdo, programação e pausa exclusivos deste destino."}</p>
          <label className="mt-3 block max-w-xl text-xs font-medium text-slate-700">Nome da rotina
            <input className={field} value={draft.name} maxLength={80} placeholder="Ex.: Destaques da semana" onChange={e => set("name", e.target.value)} />
          </label>
        </div>
        <button type="button" aria-label="Fechar editor" disabled={props.busy} onClick={() => props.setDraft(null)} className="rounded-lg p-2 text-slate-500"><X className="h-4 w-4" /></button>
      </div>
      <fieldset disabled={props.busy} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title={`1. ${isStatus ? "Configure o Status" : "Escolha os destinos"}`}>
            {(isStatus || isMixed) && <>
              {isMixed && <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.postStatus} onChange={() => set("postStatus", !draft.postStatus)} />Também publicar no Status</label>}
              {draft.postStatus && <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">Quem pode ver
                    <select className={field} value={draft.statusAudience} onChange={e => set("statusAudience", e.target.value as CampaignDraft["statusAudience"])}>
                      <option value="all">Todos os contatos</option><option value="interested">Interessados nos produtos</option><option value="customers">Clientes que já compraram</option><option value="hot">Leads quentes</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-700">Como publicar no Status
                    <select className={field} value={draft.statusStyle} onChange={e => set("statusStyle", e.target.value as CampaignDraft["statusStyle"])}><option value="single">Uma publicação por vez</option><option value="story">Sequência de 3 Status</option></select>
                  </label>
                </div>
                <p className="text-xs text-slate-500">{draft.statusStyle === "story" ? "Cada sequência reúne foto, benefício e oferta, com 2 minutos entre eles." : "Foto com legenda quando houver produto com mídia; texto quando não houver."} Status não tem botão de compra.</p>
                <div><p className="text-xs font-medium text-slate-700">Cor de fundo das publicações em texto</p><div className="mt-2 flex flex-wrap gap-2">{colors.map(([id, label, color]) => <button key={id} type="button" aria-label={`Cor ${label}`} aria-pressed={draft.statusColor === id} onClick={() => set("statusColor", id)} className={cn("h-7 w-7 rounded-full border-2", draft.statusColor === id ? "border-slate-900 ring-2 ring-white" : "border-white shadow")} style={{ backgroundColor: color }} />)}</div></div>
                <p className="text-xs text-slate-500">A visibilidade também depende das regras e da privacidade do WhatsApp dos contatos.</p>
              </>}
            </>}
            {!isStatus && <>
              <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {targets.map(t => <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"><input type="checkbox" className="accent-emerald-700" checked={draft.targetIds.includes(t.id)} onChange={() => toggle("targetIds", t.id)} /><span className="min-w-0 flex-1 truncate">{isMixed ? `${t.type === "group" ? "Grupo" : "Canal"}: ` : ""}{t.name}</span>{t.participantCount ? <span className="text-xs text-slate-500">{t.participantCount} membros</span> : null}</label>)}
                {!targets.length && <p className="p-2 text-xs text-slate-500">Nenhum destino encontrado. Atualize a lista abaixo.</p>}
              </div>
              <button type="button" disabled={props.discovering} onClick={props.onDiscover} className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><RefreshCcw className="h-3.5 w-3.5" />{props.discovering ? "Buscando…" : "Atualizar grupos e canais"}</button>
              <p className="text-xs text-slate-500">Selecione até 50 destinos para liberar a escolha do conteúdo.</p>
              {draft.targetIds.length > 50 && <p role="alert" className="text-xs text-amber-800">Selecione no máximo 50 destinos por rotina.</p>}
            </>}
          </Panel>
          <fieldset disabled={!destinationReady} className={cn("min-w-0", !destinationReady && "opacity-50")}>
            <Panel title={`2. O que publicar ${isStatus ? "no Status" : destination === "channels" ? "nos canais" : "nos grupos"}`}>
              {!isStatus && <label className="text-xs font-medium text-slate-700">Formato da publicação
                <select className={field} value={formatValue} onChange={e => {
                  const format = parseFormat(e.target.value);
                  props.setDraft({ ...draft, ...format, ...(format.postFormat === "carousel" && draft.productMode === "single" ? { productMode: "selected" as const } : {}) });
                }}>{formats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                <span className="mt-1 block font-normal text-slate-500">{postFormats.find(([id]) => id === formatValue)?.[2]}</span>
              </label>}
              {!isStatus && (draft.includeAudio || draft.postFormat === "product_audio") && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-slate-600">O áudio usa a voz configurada do agente e consome créditos de geração de áudio.</p>}
              {carousel && <label className="text-xs font-medium text-slate-700">Produtos por carrossel<select aria-label="Produtos por carrossel" className={field} value={carouselSize} onChange={e => set("carouselSize", Number(e.target.value))}>{[2, 3, 4].map(n => <option key={n} value={n}>{n} produtos · {n} cartões</option>)}</select><span className="mt-1 block font-normal text-slate-500">Nesta rotina, você pode usar de 2 a 4 produtos por publicação. Um cartão para cada produto.</span></label>}
              <label className="text-xs font-medium text-slate-700">Produtos desta rotina
                <select className={field} value={carousel && draft.productMode === "single" ? "selected" : draft.productMode} onChange={e => props.setDraft({ ...draft, productMode: e.target.value as CampaignDraft["productMode"], catalogItemIds: e.target.value === "single" ? draft.catalogItemIds.slice(0, 1) : draft.catalogItemIds })}><option value="featured">{carousel ? `Seleção automática de ${carouselSize} produtos ativos com mídia` : "IA escolhe entre os produtos ativos"}</option>{!carousel && <option value="single">Um produto específico</option>}<option value="selected">{carousel ? `Escolher os ${carouselSize} produtos` : "Selecionar alguns produtos"}</option></select>
              </label>
              {draft.productMode === "single" && !carousel && <label className="text-xs font-medium text-slate-700">Qual produto?
                <select className={field} value={draft.catalogItemIds[0] ?? ""} onChange={e => set("catalogItemIds", e.target.value ? [e.target.value] : [])}><option value="">Selecione um produto</option>{activeProducts.map(p => <option key={p.id} value={p.id} disabled={carousel && !hasMedia(p)}>{p.title}{carousel && !hasMedia(p) ? " — sem mídia" : ""}</option>)}</select>
              </label>}
              {manualProducts && <div>
                <label className="text-xs font-medium text-slate-700">Buscar produtos<input className={field} value={search} placeholder="Digite o nome" onChange={e => setSearch(e.target.value)} /></label>
                <div className="mt-2 grid max-h-48 gap-1 overflow-y-auto">{activeProducts.filter(p => p.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p => <label key={p.id} className="flex gap-2 rounded-md px-2 py-1.5 text-sm"><input type="checkbox" disabled={(carousel && !hasMedia(p)) || (!draft.catalogItemIds.includes(p.id) && draft.catalogItemIds.length >= productLimit)} checked={draft.catalogItemIds.includes(p.id)} onChange={() => toggle("catalogItemIds", p.id)} className="accent-emerald-700" />{p.title}{carousel && !hasMedia(p) ? " (sem mídia)" : ""}</label>)}</div>
                <p className="mt-1 text-xs text-slate-500">{carousel ? `${draft.catalogItemIds.length} de ${carouselSize} produtos selecionados. Escolha exatamente ${carouselSize}.` : `${draft.catalogItemIds.length} selecionado(s). Até 12 produtos por rotina.`}</p>
                {draft.catalogItemIds.length > 12 && <p role="alert" className="text-xs text-amber-800">Reduza a seleção para até 12 produtos antes de ativar.</p>}
              </div>}
              {carousel && <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">Cada publicação terá {carouselSize} produtos com mídia e botão. {draft.productMode === "featured" ? `A seleção automática alterna os produtos elegíveis do catálogo; há ${activeProducts.filter(hasMedia).length} com mídia. A IA escreve a apresentação.` : "Serão usados os produtos que você marcar."} Se faltarem produtos válidos, a publicação será interrompida e a rotina mostrará o motivo.</p>}
              {!productReady && <p role="status" className="text-xs text-amber-800">{carousel ? `São necessários ${carouselSize} produtos ativos com mídia válida. ${manualProducts ? "Complete ou ajuste a seleção." : "Cadastre mais produtos com mídia ou reduza a quantidade."}` : "Selecione pelo menos um produto ativo."}</p>}
              <label className="text-xs font-medium text-slate-700">Ideia ou oferta para orientar a IA (opcional)
                <textarea className={field} rows={2} maxLength={600} value={draft.idea} onChange={e => set("idea", e.target.value)} placeholder="Ex.: apresentar os benefícios, sem oferecer desconto" />
                <span className="mt-1 block font-normal text-slate-500">A ideia orienta o texto; os produtos são os escolhidos acima.</span>
              </label>
            </Panel>
          </fieldset>
        </div>
        <fieldset disabled={!ready} className={cn("min-w-0", !ready && "opacity-50")}>
          <Panel title="3. Programe a rotina">
            <label className="text-xs font-medium text-slate-700">Durante quanto tempo?
              <select className={field} value={draft.scheduleMode} onChange={e => set("scheduleMode", e.target.value as CampaignDraft["scheduleMode"])}>{schedules.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            </label>
            {draft.scheduleMode === "once" ? <>
              <p className="text-xs text-slate-500">Uma publicação por destino selecionado, em instantes após confirmar.</p>
              {draft.postFormat !== "poll" && <label className="text-xs font-medium text-slate-700">Legenda pronta (opcional)<textarea className={field} rows={3} value={draft.manualText} maxLength={1500} onChange={e => set("manualText", e.target.value)} placeholder="Deixe vazio para a IA escrever" /></label>}
            </> : <>
              <p className="text-xs text-slate-500">Publica diariamente durante o período escolhido. Não é uma publicação semanal ou mensal.</p>
              <label className="text-xs font-medium text-slate-700">Quantidade por dia
                <select className={field} value={draft.intensity} onChange={e => set("intensity", e.target.value as CampaignDraft["intensity"])}>{([['light', 1], ['normal', 2], ['intense', 3]] as const).map(([id, count]) => <option key={id} value={id}>{count} {isStatus && draft.statusStyle === "story" ? "sequência(s) de 3 Status" : "publicação(ões) por destino"}</option>)}</select>
              </label>
              <label className="text-xs font-medium text-slate-700">Data de início<input type="date" className={field} min={trafficToday()} value={draft.startDate ?? (draft.startsAt && draft.startsAt.slice(0, 10) >= trafficToday() ? draft.startsAt.slice(0, 10) : trafficToday())} onChange={e => set("startDate", e.target.value)} /></label>
              <label className="text-xs font-medium text-slate-700">Começar às (Brasília)
                <select className={field} value={draft.startHour} onChange={e => props.setDraft({ ...draft, startHour: Number(e.target.value), startDate: draft.startDate ?? (draft.startsAt && draft.startsAt.slice(0, 10) >= trafficToday() ? draft.startsAt.slice(0, 10) : trafficToday()) })}>{Array.from({ length: 15 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
              </label>
              <p className="text-xs text-slate-500">As publicações são distribuídas nas 10 horas seguintes ao início. Se o horário de hoje já passou, o sistema usa o próximo horário disponível.</p>
            </>}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950"><p className="font-semibold">Resumo antes de ativar</p><p className="mt-1">{isStatus ? "Meu Status" : `${draft.targetIds.length} destino(s) selecionado(s)`} · {isStatus ? draft.statusStyle === "story" ? "Sequência de 3 Status" : "Status único" : postFormats.find(([id]) => id === formatValue)?.[1]}</p><p className="mt-1">{schedules.find(([id]) => id === draft.scheduleMode)?.[1]}</p><p className="mt-1">{carousel ? `${carouselSize} produtos por carrossel · ` : ""}{draft.includeAudio || draft.postFormat === "product_audio" ? "Com áudio do agente" : "Sem áudio adicional"}</p><p className="mt-2">A geração pela IA utiliza os créditos da sua conta.</p></div>
            {draft.id && <p className="text-xs text-slate-500">Salvar substitui as publicações ainda agendadas desta rotina. Envios já realizados ficam no histórico.</p>}
          </Panel>
        </fieldset>
      </fieldset>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={props.busy} onClick={() => props.setDraft(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={!ready || props.busy} onClick={props.onSave} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{props.busy ? "Salvando…" : draft.id ? "Salvar rotina" : draft.scheduleMode === "once" ? "Confirmar publicação" : "Ativar rotina"}</button></div>
    </div>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return <section className="grid content-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><h5 className="text-sm font-semibold text-slate-900">{props.title}</h5>{props.children}</section>;
}
