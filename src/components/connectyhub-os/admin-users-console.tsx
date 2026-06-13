"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Mail, Shield, User } from "lucide-react";
import { NeonBadge, PageHeader, Panel } from "./panel-primitives";
import { cn } from "@/lib/utils";

type PlatformUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
  isPlatformAdmin: boolean;
  orgName: string | null;
  orgRole: string | null;
  orgStatus: string | null;
  planCode: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  trial: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  inactive: "text-slate-400 border-slate-600/30 bg-slate-600/10",
  suspended: "text-rose-300 border-rose-400/30 bg-rose-400/10",
};

export function AdminUsersConsole() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [linkUserId, setLinkUserId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInitialUsers() {
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { users?: PlatformUser[]; error?: string } | null;

        if (!response.ok || !data) {
          throw new Error(data?.error ?? "Nao foi possivel carregar os usuarios.");
        }

        if (!cancelled) {
          setUsers(data.users ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao carregar usuarios." });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  async function getAccessLink(userId: string): Promise<string | null> {
    const response = await fetch("/api/admin/users/access-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = (await response.json().catch(() => null)) as { actionLink?: string; error?: string } | null;

    if (!response.ok || !data?.actionLink) {
      throw new Error(data?.error ?? "Nao foi possivel gerar o link.");
    }

    return data.actionLink;
  }

  async function handleAccessPanel(userId: string) {
    setActionUserId(userId);
    setNotice(null);

    try {
      const link = await getAccessLink(userId);
      window.open(link!, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao gerar link de acesso." });
    } finally {
      setActionUserId(null);
    }
  }

  async function handleSendLink(userId: string) {
    setLinkUserId(userId);
    setNotice(null);

    try {
      const link = await getAccessLink(userId);
      await navigator.clipboard.writeText(link!);
      setCopiedUserId(userId);
      setNotice({ tone: "success", message: "Link copiado. Envie para o usuario pelo canal de sua preferencia." });
      setTimeout(() => setCopiedUserId(null), 3000);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao gerar link." });
    } finally {
      setLinkUserId(null);
    }
  }

  const filtered = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase();
        return (
          u.email?.toLowerCase().includes(q) ||
          u.fullName?.toLowerCase().includes(q) ||
          u.orgName?.toLowerCase().includes(q) ||
          u.companyName?.toLowerCase().includes(q)
        );
      })
    : users;

  return (
    <>
      <PageHeader
        eyebrow="Admin OS · Gestao de Usuarios"
        title="Usuarios da plataforma"
        description="Liste, envie links de acesso e entre no painel de qualquer usuario registrado."
      />

      {notice && (
        <div
          className={cn(
            "mb-5 rounded-xl border px-4 py-3 text-[13px] leading-5",
            notice.tone === "success" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
            notice.tone === "warning" && "border-amber-400/25 bg-amber-400/10 text-amber-200",
            notice.tone === "error" && "border-rose-400/25 bg-rose-400/10 text-rose-200",
          )}
        >
          {notice.message}
        </div>
      )}

      <Panel
        title={`${filtered.length} usuario${filtered.length !== 1 ? "s" : ""}`}
        eyebrow="plataforma / clientes"
        action={
          <div className="flex items-center gap-2">
            <NeonBadge tone={loading ? "amber" : "green"}>{loading ? "Carregando" : "Ao vivo"}</NeonBadge>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-8 rounded-lg border px-3 font-mono text-[11px] outline-none"
              style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
            />
          </div>
        }
      >
        {loading ? (
          <div className="grid min-h-[280px] place-items-center text-cyan-300">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center font-mono text-[12px] text-slate-500">
            {search ? "Nenhum usuario corresponde à busca." : "Nenhum usuario encontrado."}
          </p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isAccessingPanel={actionUserId === user.id}
                isSendingLink={linkUserId === user.id}
                isCopied={copiedUserId === user.id}
                onAccessPanel={() => handleAccessPanel(user.id)}
                onSendLink={() => handleSendLink(user.id)}
              />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

function UserRow({
  user,
  isAccessingPanel,
  isSendingLink,
  isCopied,
  onAccessPanel,
  onSendLink,
}: {
  user: PlatformUser;
  isAccessingPanel: boolean;
  isSendingLink: boolean;
  isCopied: boolean;
  onAccessPanel: () => void;
  onSendLink: () => void;
}) {
  const displayName = user.fullName || user.companyName || user.email?.split("@")[0] || "—";
  const statusColor = STATUS_COLORS[user.orgStatus ?? ""] ?? STATUS_COLORS["inactive"];
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      className="flex min-h-[68px] items-center gap-3 rounded-xl border px-4"
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[13px] font-bold"
        style={{ background: user.isPlatformAdmin ? "rgba(34,211,238,0.12)" : "rgba(100,116,139,0.12)", color: user.isPlatformAdmin ? "rgb(103,232,249)" : "rgb(148,163,184)" }}>
        {initials || <User className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {displayName}
          </p>
          {user.isPlatformAdmin && (
            <Shield className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-label="Admin" />
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <p className="font-mono text-[10px] text-slate-500">{user.email}</p>
          {user.orgName && (
            <p className="font-mono text-[10px] text-slate-600">{user.orgName}</p>
          )}
          {user.orgStatus && (
            <span className={cn("rounded-full border px-2 py-px font-mono text-[9px] font-semibold uppercase tracking-wide", statusColor)}>
              {user.orgStatus}
            </span>
          )}
          {user.planCode && (
            <span className="font-mono text-[9px] uppercase tracking-wide text-slate-600">
              {user.planCode}
            </span>
          )}
        </div>
      </div>

      {user.lastSignInAt && (
        <p className="hidden shrink-0 font-mono text-[9px] text-slate-600 lg:block">
          {formatShortDate(user.lastSignInAt)}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={isSendingLink || isAccessingPanel}
          onClick={onSendLink}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
            isCopied
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
              : "border-cyan-400/25 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15",
          )}
        >
          {isSendingLink ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Mail className="h-3 w-3" />
          )}
          {isCopied ? "Copiado!" : "Enviar link"}
        </button>

        <button
          type="button"
          disabled={isAccessingPanel || isSendingLink || user.isPlatformAdmin}
          onClick={onAccessPanel}
          title={user.isPlatformAdmin ? "Nao e possivel acessar o painel de outro admin" : undefined}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isAccessingPanel ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ExternalLink className="h-3 w-3" />
          )}
          Acessar painel
        </button>
      </div>
    </div>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
