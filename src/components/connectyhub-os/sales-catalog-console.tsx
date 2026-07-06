"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  FileText,
  ImageIcon,
  Loader2,
  PackagePlus,
  Plus,
  Tags,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { NeonBadge, PageHeader, Panel } from "./panel-primitives";
import type { ClientCompany } from "@/lib/client-os/companies";
import type { ClientSalesCatalogItem, SalesCatalogItemStatus, SalesCatalogMedia } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type SalesCatalogConsoleProps = {
  initialCompanies: ClientCompany[];
  initialItems: ClientSalesCatalogItem[];
  initialCompanyId: string | null;
};

const statusOptions: Array<{ value: SalesCatalogItemStatus; label: string }> = [
  { value: "active", label: "Ativo" },
  { value: "draft", label: "Rascunho" },
];

export function SalesCatalogConsole({ initialCompanies, initialItems, initialCompanyId }: SalesCatalogConsoleProps) {
  const [companies] = useState(initialCompanies);
  const [items, setItems] = useState(initialItems);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId ?? initialCompanies[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SalesCatalogItemStatus>("active");
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => !selectedCompanyId || item.companyId === selectedCompanyId),
    [items, selectedCompanyId],
  );
  const stats = useMemo(() => {
    const active = visibleItems.filter((item) => item.status === "active").length;
    const ready = visibleItems.filter((item) => item.readiness === "ready").length;
    const media = visibleItems.reduce((total, item) => total + item.media.length, 0);

    return { active, ready, media };
  }, [visibleItems]);
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const canCreate = Boolean(selectedCompanyId && title.trim() && description.trim() && !creating);

  async function createItem() {
    if (!canCreate) return;

    setCreating(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("companyId", selectedCompanyId);
      formData.set("title", title);
      formData.set("description", description);
      formData.set("category", category);
      formData.set("price", price);
      formData.set("currency", "BRL");
      formData.set("status", status);

      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null) as { item?: ClientSalesCatalogItem; error?: string } | null;

      if (!response.ok || !data?.item) {
        throw new Error(data?.error ?? "Nao foi possivel cadastrar o item.");
      }

      setItems((current) => [data.item!, ...current.filter((item) => item.id !== data.item!.id)]);
      resetForm();
      setNotice({ tone: "success", message: "Item cadastrado no catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar item." });
    } finally {
      setCreating(false);
    }
  }

  async function deleteItem(item: ClientSalesCatalogItem) {
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      return;
    }

    setDeletingId(item.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: item.companyId, itemId: item.id }),
      });
      const data = await response.json().catch(() => null) as { deletedItemId?: string; error?: string } | null;

      if (!response.ok || data?.deletedItemId !== item.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o item.");
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Item removido do catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir item." });
    } finally {
      setDeletingId(null);
    }
  }

  async function copyTag(item: ClientSalesCatalogItem) {
    try {
      await navigator.clipboard.writeText(item.tag);
      setNotice({ tone: "success", message: `Tag copiada: ${item.tag}` });
    } catch {
      setNotice({ tone: "warning", message: item.tag });
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).slice(0, 8));
  }

  function resetForm() {
    setTitle("");
    setCategory("");
    setPrice("");
    setDescription("");
    setStatus("active");
    setFiles([]);
  }

  if (companies.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Workspace / Vendas"
          title="Catalogo de Vendas"
          description="Cadastre uma empresa antes de montar o catalogo."
        />
        <Panel title="Empresa obrigatoria" eyebrow="catalogo">
          <Link
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200"
            href="/dashboard/empresa"
          >
            <Plus className="h-4 w-4" />
            Cadastrar empresa
          </Link>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Vendas"
        title="Catalogo de Vendas"
        description="Itens que o agente pode apresentar e enviar no WhatsApp."
        actions={<NeonBadge tone="cyan">{visibleItems.length} itens</NeonBadge>}
      />

      {notice ? (
        <div
          className={cn(
            "mb-4 rounded-xl border px-4 py-3 text-[12px]",
            notice.tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "",
            notice.tone === "warning" ? "border-amber-400/25 bg-amber-400/10 text-amber-100" : "",
            notice.tone === "error" ? "border-rose-400/25 bg-rose-400/10 text-rose-100" : "",
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <StatTile icon={PackagePlus} label="Ativos" value={String(stats.active)} />
        <StatTile icon={CheckCircle2} label="Prontos" value={String(stats.ready)} />
        <StatTile icon={Upload} label="Arquivos" value={String(stats.media)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]">
        <Panel title="Novo item" eyebrow={selectedCompany?.name ?? "empresa"}>
          <div className="space-y-3">
            <label className="block">
              <FieldLabel>Empresa</FieldLabel>
              <select
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                style={{ borderColor: "var(--ch-border)" }}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <FieldLabel>Nome</FieldLabel>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                placeholder="Ex.: Plano mensal, camiseta preta, consulta inicial"
                style={{ borderColor: "var(--ch-border)" }}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Categoria</FieldLabel>
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value.slice(0, 80))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Produto, servico, plano"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>
              <label className="block">
                <FieldLabel>Valor</FieldLabel>
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value.slice(0, 60))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="R$ 197,00"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>
            </div>

            <label className="block">
              <FieldLabel>Descricao comercial</FieldLabel>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, 1800))}
                className="min-h-28 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                placeholder="O que e, para quem serve, principais beneficios, entrega, garantias e condicoes."
                style={{ borderColor: "var(--ch-border)" }}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="block">
                <FieldLabel>Fotos, videos ou arquivos</FieldLabel>
                <label
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-center text-[12px] text-slate-400 transition hover:border-cyan-300/60 hover:text-cyan-200"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <Upload className="h-4 w-4" />
                  {files.length > 0 ? `${files.length} arquivo(s)` : "Selecionar arquivos"}
                  <input
                    multiple
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv"
                    className="sr-only"
                    type="file"
                    onChange={handleFiles}
                  />
                </label>
              </label>
              <label className="block">
                <FieldLabel>Status</FieldLabel>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as SalesCatalogItemStatus)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {files.length > 0 ? (
              <div className="grid gap-2">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="min-w-0 truncate text-slate-300">{file.name}</span>
                    <span className="shrink-0 font-mono text-slate-500">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canCreate}
              onClick={createItem}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Cadastrar no catalogo
            </button>
          </div>
        </Panel>

        <Panel title="Itens cadastrados" eyebrow={selectedCompany?.name ?? "catalogo"}>
          {visibleItems.length > 0 ? (
            <div className="grid gap-3">
              {visibleItems.map((item) => (
                <CatalogItemCard
                  key={item.id}
                  confirmDelete={confirmDeleteId === item.id}
                  deleting={deletingId === item.id}
                  item={item}
                  onCopy={() => copyTag(item)}
                  onDelete={() => deleteItem(item)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
              Nenhum item cadastrado para esta empresa.
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function CatalogItemCard({
  item,
  confirmDelete,
  deleting,
  onCopy,
  onDelete,
}: {
  item: ClientSalesCatalogItem;
  confirmDelete: boolean;
  deleting: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const cover = item.media.find((media) => media.kind === "image");

  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[92px_minmax(0,1fr)]" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg border" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
        {cover ? (
          <Image alt={item.title} className="object-cover" fill sizes="92px" src={cover.storageUrl} />
        ) : (
          <Tags className="h-8 w-8 text-slate-600" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-slate-100">{item.title}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {item.category ? <span>{item.category}</span> : null}
              {item.price ? <span>{item.price} {item.currency}</span> : null}
              <span>{formatStatus(item.status)}</span>
            </p>
          </div>
          <NeonBadge tone={item.readiness === "ready" ? "green" : "amber"}>{formatReadiness(item.readiness)}</NeonBadge>
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{item.description}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.media.slice(0, 6).map((media) => (
            <span key={media.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
              <MediaIcon media={media} />
              {media.fileName}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
            style={{ borderColor: "var(--ch-border)" }}
            title={item.tag}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{item.tag}</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-50",
              confirmDelete ? "border-rose-400/35 bg-rose-400/10 text-rose-100" : "text-slate-400 hover:bg-rose-400/10 hover:text-rose-100",
            )}
            style={{ borderColor: confirmDelete ? undefined : "var(--ch-border)" }}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {confirmDelete ? "Confirmar" : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof PackagePlus; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-3 font-mono text-[24px] font-bold text-cyan-200">{value}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">{children}</span>;
}

function MediaIcon({ media }: { media: SalesCatalogMedia }) {
  if (media.kind === "image") return <ImageIcon className="h-3 w-3" />;
  if (media.kind === "video") return <Video className="h-3 w-3" />;
  return <FileText className="h-3 w-3" />;
}

function formatStatus(status: SalesCatalogItemStatus) {
  if (status === "draft") return "rascunho";
  if (status === "archived") return "arquivado";
  return "ativo";
}

function formatReadiness(value: ClientSalesCatalogItem["readiness"]) {
  if (value === "ready") return "pronto";
  if (value === "needs_media") return "sem midia";
  return "sem descricao";
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
