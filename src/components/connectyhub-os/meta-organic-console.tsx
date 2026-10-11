"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Send,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { KpiStat, NeonBadge, PageHeader, Panel } from "@/components/connectyhub-os/panel-primitives";
import { cn } from "@/lib/utils";
import type {
  ClientMetaOrganicMediaAsset,
  ClientMetaOrganicOverview,
  ClientMetaOrganicPost,
  ClientMetaOrganicPostStatus,
} from "@/lib/meta/organic-publishing";
import type { MetaOrganicSurface } from "@/lib/meta/organic-publishing-policy";

type Notice = {
  message: string;
  tone: "success" | "error";
};

type DraftState = {
  caption: string;
  facebook: boolean;
  instagram: boolean;
  linkUrl: string;
  mediaUrl: string;
  scheduledFor: string;
  title: string;
};

const emptyDraft: DraftState = {
  caption: "",
  facebook: true,
  instagram: true,
  linkUrl: "",
  mediaUrl: "",
  scheduledFor: "",
  title: "",
};

export function MetaOrganicConsole({ overview: initialOverview, initialView = "compose" }: { overview: ClientMetaOrganicOverview; initialView?: "compose" | "calendar" | "library" }) {
  const [view, setView] = useState(initialView);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [overview, setOverview] = useState(initialOverview);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const visibleItems = useMemo(() => overview.items.slice(0, 12), [overview.items]);

  async function submitDraft() {
    const surfaces: MetaOrganicSurface[] = [
      draft.facebook ? "facebook_page" : null,
      draft.instagram ? "instagram_feed" : null,
    ].filter((item): item is MetaOrganicSurface => Boolean(item));

    await runAction("create_draft", {
      caption: draft.caption,
      linkUrl: draft.linkUrl,
      mediaUrl: draft.mediaUrl,
      scheduledFor: toApiScheduledFor(draft.scheduledFor),
      surfaces,
      title: draft.title,
    }, {
      clearDraft: true,
      label: "Rascunho criado.",
    });
  }

  async function refresh() {
    setWorkingAction("refresh");
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/meta-organic", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { error?: string; overview?: ClientMetaOrganicOverview };

      if (!response.ok || !payload.overview) {
        throw new Error(payload.error ?? "Nao foi possivel atualizar publicacoes Meta.");
      }

      setOverview(payload.overview);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Erro inesperado ao atualizar.",
        tone: "error",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function uploadMedia(file: File | null) {
    if (!file) {
      return;
    }

    setUploadingMedia(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/dashboard/meta-organic/media", {
        body: formData,
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        media?: ClientMetaOrganicMediaAsset;
        overview?: ClientMetaOrganicOverview;
      };

      if (!response.ok || !payload.media || !payload.overview) {
        throw new Error(payload.error ?? "Nao foi possivel enviar midia Meta.");
      }

      setOverview(payload.overview);
      setDraft((current) => ({ ...current, mediaUrl: payload.media?.storageUrl ?? current.mediaUrl }));
      setNotice({ message: "Midia enviada para biblioteca Meta.", tone: "success" });
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Erro inesperado ao enviar midia.",
        tone: "error",
      });
    } finally {
      setUploadingMedia(false);
    }
  }

  async function runAction(
    action: "create_draft" | "approve" | "publish" | "archive",
    payload: Record<string, unknown>,
    options: { clearDraft?: boolean; label: string },
  ) {
    setWorkingAction(`${action}:${String(payload.itemId ?? "new")}`);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/meta-organic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; overview?: ClientMetaOrganicOverview };

      if (!response.ok || !body.overview) {
        throw new Error(body.error ?? "Nao foi possivel processar a publicacao Meta.");
      }

      setOverview(body.overview);
      setNotice({ message: options.label, tone: "success" });

      if (options.clearDraft) {
        setDraft(emptyDraft);
      }
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Erro inesperado na publicacao Meta.",
        tone: "error",
      });
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Meta / Organico"
        title="Publicacao organica"
        description="Rascunhos, aprovacao e envio para Instagram e Facebook."
        actions={
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={workingAction === "refresh"}
            onClick={() => void refresh()}
            type="button"
          >
            {workingAction === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        }
      />

      <nav aria-label="Planejamento de publicações" className="mb-5 flex flex-wrap gap-2">
        {([["compose","Criar publicação"],["calendar","Calendário"],["library","Biblioteca de criativos"]] as const).map(([key,label]) => <button key={key} className={`rounded-xl border px-4 py-2 text-sm ${view===key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`} onClick={()=>setView(key)}>{label}</button>)}
      </nav>
      {view === "calendar" && <MetaMonthCalendar items={overview.items} onDay={date => {setDraft(current=>({...current,scheduledFor:date+"T09:00"}));setView("compose");}}/>}
      {view === "library" && <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-2 font-semibold text-slate-900">Biblioteca de criativos</h2><p className="mb-4 text-sm text-slate-500">Selecione uma imagem para compor uma publicação ou envie uma nova imagem pelo editor. A biblioteca mantém as mídias da sua empresa.</p><MediaLibrary media={overview.media} onUse={asset=>{setDraft(current=>({...current,mediaUrl:asset.storageUrl}));setView("compose");}}/>{!overview.media.length && <p className="text-sm text-slate-500">Nenhuma mídia enviada ainda.</p>}<button className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white" onClick={()=>setView("compose")}>Enviar mídia e criar post</button></div>}
      <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-7">
        <KpiStat label="Total" value={String(overview.summary.total)} tone="cyan" />
        <KpiStat label="Rascunhos" value={String(overview.summary.drafts)} tone="zinc" />
        <KpiStat label="Aprovados" value={String(overview.summary.approved)} tone="amber" />
        <KpiStat label="Agendados" value={String(overview.summary.scheduled)} tone="violet" />
        <KpiStat label="Publicando" value={String(overview.summary.publishing)} tone="cyan" />
        <KpiStat label="Publicados" value={String(overview.summary.published)} tone="green" />
        <KpiStat label="Falhas" value={String(overview.summary.failed)} tone="rose" />
      </div>

      <div className={view === "compose" ? "grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]" : "hidden"}>
        <Panel eyebrow="Composicao" title="Novo rascunho" tone="cyan">
          <div className="grid gap-3">
            {notice ? (
              <div className={cn(
                "rounded-xl border px-3 py-2 text-[12px]",
                notice.tone === "success"
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-400/25 bg-rose-400/10 text-rose-100",
              )}>
                {notice.message}
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Titulo</span>
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
                maxLength={140}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Campanha de julho"
                value={draft.title}
              />
            </label>

            <label className="grid gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Legenda</span>
              <textarea
                className="min-h-[170px] resize-y rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-[13px] leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
                maxLength={2200}
                onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))}
                placeholder="Texto do post..."
                value={draft.caption}
              />
            </label>

            <label className="grid gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Midia publica</span>
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
                onChange={(event) => setDraft((current) => ({ ...current, mediaUrl: event.target.value }))}
                placeholder="https://..."
                value={draft.mediaUrl}
              />
            </label>

            <label className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Upload de imagem</span>
              <span className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/15">
                {uploadingMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                {uploadingMedia ? "Enviando" : "Selecionar imagem"}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingMedia}
                onChange={(event) => {
                  void uploadMedia(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>

            <MediaLibrary
              media={overview.media}
              onUse={(asset) => setDraft((current) => ({ ...current, mediaUrl: asset.storageUrl }))}
            />

            <label className="grid gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Link</span>
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
                onChange={(event) => setDraft((current) => ({ ...current, linkUrl: event.target.value }))}
                placeholder="https://..."
                value={draft.linkUrl}
              />
            </label>

            <label className="grid gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Agendar para</span>
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-950/60 px-3 font-mono text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-300/45"
                min={getDatetimeLocalMin()}
                onChange={(event) => setDraft((current) => ({ ...current, scheduledFor: event.target.value }))}
                type="datetime-local"
                value={draft.scheduledFor}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <ChannelToggle
                active={draft.facebook}
                icon="facebook"
                label="Facebook"
                onClick={() => setDraft((current) => ({ ...current, facebook: !current.facebook }))}
              />
              <ChannelToggle
                active={draft.instagram}
                icon="instagram"
                label="Instagram"
                onClick={() => setDraft((current) => ({ ...current, instagram: !current.instagram }))}
              />
            </div>

            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={workingAction === "create_draft:new"}
              onClick={() => void submitDraft()}
              type="button"
            >
              {workingAction === "create_draft:new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Salvar rascunho
            </button>
          </div>
        </Panel>

        <Panel
          eyebrow="Pipeline"
          title="Publicacoes Meta"
          tone={overview.summary.failed ? "rose" : "amber"}
          action={<NeonBadge tone={overview.summary.failed ? "rose" : "amber"}>{overview.items.length} itens</NeonBadge>}
        >
          <div className="grid gap-3">
            <EditorialCalendar items={overview.items} />

            {visibleItems.map((item) => (
              <OrganicPostItem
                item={item}
                key={item.id}
                onApprove={() => runAction("approve", { itemId: item.id }, { label: "Publicacao aprovada." })}
                onArchive={() => runAction("archive", { itemId: item.id }, { label: "Publicacao arquivada." })}
                onPublish={() => runAction("publish", { itemId: item.id }, { label: "Tentativa de publicacao registrada." })}
                workingAction={workingAction}
              />
            ))}
            {!visibleItems.length ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                <ImageIcon className="h-8 w-8 text-slate-600" />
                <p className="mt-3 text-[14px] font-semibold text-white">Sem publicacoes Meta</p>
                <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-slate-500">Os rascunhos organicos aparecem aqui.</p>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function OrganicPostItem({
  item,
  onApprove,
  onArchive,
  onPublish,
  workingAction,
}: {
  item: ClientMetaOrganicPost;
  onApprove: () => Promise<void>;
  onArchive: () => Promise<void>;
  onPublish: () => Promise<void>;
  workingAction: string | null;
}) {
  const approveKey = `approve:${item.id}`;
  const archiveKey = `archive:${item.id}`;
  const publishKey = `publish:${item.id}`;
  const canApprove = item.status === "draft" || item.status === "review";
  const canPublish = item.status === "approved" || item.status === "scheduled" || item.retryable;
  const canArchive = item.status !== "published" && item.status !== "archived" && item.status !== "publishing";

  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3 lg:grid-cols-[minmax(0,1fr)_190px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={item.status} text={item.statusLabel} warning={Boolean(item.lastError)} />
          {item.surfaceLabels.map((label) => (
            <span key={label} className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-slate-400">
              {label}
            </span>
          ))}
          <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-slate-500">
            {formatDateTime(item.publishedAt ?? item.scheduledFor ?? item.approvedAt ?? item.createdAt)}
          </span>
        </div>

        {item.scheduledFor && item.status === "scheduled" ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/10 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-violet-100">
            <Clock3 className="h-3.5 w-3.5" />
            {formatDateTime(item.scheduledFor)}
          </div>
        ) : null}

        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-white">{item.title}</p>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-5 text-slate-400">{item.caption}</p>
        </div>

        {item.mediaUrl || item.linkUrl ? (
          <div className="flex flex-wrap gap-2">
            {item.mediaUrl ? <ExternalBadge href={item.mediaUrl} icon={<ImageIcon className="h-3.5 w-3.5" />} label="Midia" /> : null}
            {item.linkUrl ? <ExternalBadge href={item.linkUrl} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Link" /> : null}
          </div>
        ) : null}

        {item.lastError ? (
          <p className="line-clamp-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[12px] leading-5 text-rose-100">
            {item.lastError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {item.providerIds.slice(0, 3).map((id) => (
            <span key={id} className="rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-slate-500">
              ID {id}
            </span>
          ))}
          {item.audit[0] ? (
            <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-slate-500">
              {formatAudit(item.audit[0].type)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid content-start gap-2">
        {canApprove ? (
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={workingAction === approveKey}
            onClick={() => void onApprove()}
            type="button"
          >
            {workingAction === approveKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Aprovar
          </button>
        ) : null}
        {canPublish ? (
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/15 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={workingAction === publishKey}
            onClick={() => void onPublish()}
            type="button"
          >
            {workingAction === publishKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Publicar
          </button>
        ) : null}
        {canArchive ? (
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={workingAction === archiveKey}
            onClick={() => void onArchive()}
            type="button"
          >
            {workingAction === archiveKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Arquivar
          </button>
        ) : null}
        {!canApprove && !canPublish && !canArchive ? (
          <span className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Archive className="h-3.5 w-3.5" />
            Sem acao
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MediaLibrary({
  media,
  onUse,
}: {
  media: ClientMetaOrganicMediaAsset[];
  onUse: (asset: ClientMetaOrganicMediaAsset) => void;
}) {
  const recentMedia = media;

  if (!recentMedia.length) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Biblioteca</span>
        <NeonBadge tone="violet">{media.length} midias</NeonBadge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {recentMedia.map((asset) => (
          <button
            className="group grid min-w-0 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2 text-left transition hover:border-violet-300/35 hover:bg-violet-300/10"
            key={asset.id}
            onClick={() => onUse(asset)}
            title={`Usar ${asset.fileName}`}
            type="button"
          >
            <span className="aspect-square overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                src={asset.storageUrl}
              />
            </span>
            <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-wide text-slate-500 group-hover:text-violet-100">
              {formatBytes(asset.bytesSize)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EditorialCalendar({ items }: { items: ClientMetaOrganicPost[] }) {
  const calendarItems = useMemo(() => {
    return items
      .map((item) => ({
        item,
        date: item.scheduledFor ?? item.publishedAt ?? null,
      }))
      .filter((entry): entry is { item: ClientMetaOrganicPost; date: string } => Boolean(entry.date))
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
      .slice(0, 8);
  }, [items]);

  return (
    <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-violet-300/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-violet-200" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-violet-100">Calendario editorial</span>
        </div>
        <NeonBadge tone="violet">{calendarItems.length} datas</NeonBadge>
      </div>

      {calendarItems.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {calendarItems.map(({ item, date }) => (
            <div
              className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-2 rounded-xl border border-white/10 bg-slate-950/35 p-2"
              key={`${item.id}:${date}`}
            >
              <div className="grid h-14 place-items-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-center font-mono text-[11px] font-bold uppercase leading-4 text-violet-100">
                {formatCalendarDate(date)}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusPill status={item.status} text={item.statusLabel} warning={Boolean(item.lastError)} />
                  <span className="truncate font-mono text-[11px] uppercase tracking-wide text-slate-500">{formatDateTime(date)}</span>
                </div>
                <p className="mt-1 truncate text-[12px] font-semibold text-white">{item.title}</p>
                <p className="truncate text-[11px] text-slate-500">{item.surfaceLabels.join(" + ")}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-3 py-6 text-center text-[12px] text-slate-500">
          Nenhuma data editorial registrada.
        </div>
      )}
    </div>
  );
}

function ChannelToggle({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: "facebook" | "instagram";
  label: string;
  onClick: () => void;
}) {
  const Icon = icon === "facebook" ? Globe2 : ImageIcon;

  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 font-mono text-[11px] font-bold uppercase tracking-wide transition",
        active
          ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-slate-500 hover:bg-white/[0.05]",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function StatusPill({
  status,
  text,
  warning,
}: {
  status: ClientMetaOrganicPostStatus;
  text: string;
  warning: boolean;
}) {
  return <NeonBadge tone={warning ? "rose" : getStatusTone(status)}>{text}</NeonBadge>;
}

function ExternalBadge({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      className="inline-flex h-8 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/15"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {icon}
      {label}
    </a>
  );
}

function getStatusTone(status: ClientMetaOrganicPostStatus): "green" | "cyan" | "amber" | "rose" | "violet" | "zinc" {
  switch (status) {
    case "approved":
      return "amber";
    case "scheduled":
      return "violet";
    case "publishing":
      return "cyan";
    case "published":
      return "green";
    case "review":
      return "rose";
    case "archived":
    case "draft":
      return "zinc";
  }
}

function formatAudit(value: string) {
  switch (value) {
    case "draft_created":
      return "rascunho criado";
    case "post_approved":
      return "aprovado";
    case "post_scheduled":
      return "agendado";
    case "publish_started":
      return "envio iniciado";
    case "scheduled_publish_started":
      return "agendamento iniciado";
    case "publish_completed":
      return "publicado";
    case "publish_failed":
    case "scheduled_publish_failed":
      return "falhou";
    case "post_archived":
      return "arquivado";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatCalendarDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "--";
  const month = parts.find((part) => part.type === "month")?.value.replace(".", "") ?? "";

  return `${day} ${month}`;
}

function getDatetimeLocalMin() {
  const date = new Date(Date.now() + 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toApiScheduledFor(value: string) {
  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 KB";
  }

  if (value < 1024 * 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function MetaMonthCalendar({ items, onDay }: {items: ClientMetaOrganicPost[];onDay:(date:string)=>void}) {
  const [month,setMonth]=useState(()=>getDatetimeLocalMin().slice(0,7));
  const [network,setNetwork]=useState("all");
  const [status,setStatus]=useState("all");
  const [year,m]=month.split("-").map(Number);
  const days=new Date(year,m,0).getDate();
  const offset=(new Date(year,m-1,1).getDay()+6)%7;
  const relevant=items.filter(item=>(network==="all" || item.surfaces.includes(network as MetaOrganicSurface)) && (status==="all" || item.status===status));
  function dayKey(value:string) { const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
  function shift(delta:number) {const d=new Date(year,m-1+delta,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}
  return <section aria-label="Calendário mensal de publicações" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
    <div className="mb-4 flex flex-wrap items-center gap-3"><button aria-label="Mês anterior" className="rounded-lg border px-3 py-2" onClick={()=>shift(-1)}>←</button><input type="month" aria-label="Mês das publicações" className="rounded-lg border p-2" value={month} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value);}}/><button aria-label="Próximo mês" className="rounded-lg border px-3 py-2" onClick={()=>shift(1)}>→</button><select aria-label="Rede social" className="rounded-lg border p-2 text-sm" value={network} onChange={e=>setNetwork(e.target.value)}><option value="all">Todas as redes</option><option value="facebook_page">Facebook</option><option value="instagram_feed">Instagram</option></select><select aria-label="Status da publicação" className="rounded-lg border p-2 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos os status</option><option value="draft">Rascunhos</option><option value="scheduled">Agendadas</option><option value="published">Publicadas</option><option value="approved">Aprovadas</option></select></div>
    <p className="mb-3 text-xs text-slate-500">Exibe as 40 publicações mais recentes carregadas. Horário local do navegador. Escolha um dia para preparar um post. Salvar rascunho não publica: revise e aprove para ativar o agendamento.</p>
    <div className="overflow-x-auto"><div className="grid min-w-[600px] grid-cols-7">{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d=><div key={d} className="p-2 text-center text-xs text-slate-500">{d}</div>)}{Array.from({length:offset},(_,i)=><div key={`empty-${i}`} className="border border-slate-100 bg-slate-50"/>)}{Array.from({length:days},(_,i)=>{const key=`${month}-${String(i+1).padStart(2,"0")}`;const entries=relevant.filter(item=>{const at=item.scheduledFor || item.publishedAt;return at && dayKey(at)===key;});return <button key={key} onClick={()=>onDay(key)} className="min-h-28 border border-slate-100 p-2 text-left align-top hover:bg-blue-50" aria-label={`Preparar publicação em ${key}`}><span className="text-xs font-semibold">{i+1}</span>{entries.map(item=><span key={item.id} title={item.caption} className="mt-1 block rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-800"><span className="block truncate font-semibold">{item.title}</span>{item.statusLabel}</span>)}</button>;})}</div></div>
    <p className="mt-3 text-xs text-slate-500">{relevant.filter(item=>!item.scheduledFor&&!item.publishedAt).length} publicações sem data. Use “Criar publicação” para revisar a lista e as aprovações.</p>
  </section>;
}
