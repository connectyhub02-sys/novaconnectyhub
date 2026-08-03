"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Ban,
  Camera,
  CheckCircle2,
  Coins,
  ExternalLink,
  HardDrive,
  Loader2,
  Mail,
  MinusCircle,
  RefreshCw,
  Settings2,
  Shield,
  TimerReset,
  User,
  WalletCards,
  X,
} from "lucide-react";
import { NeonBadge, PageHeader, Panel } from "./panel-primitives";
import { clearAdminImpersonationReturn, saveAdminImpersonationReturn } from "@/lib/admin-impersonation";
import type { AdminUsersSnapshot } from "@/lib/admin/users";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type PlatformUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneWhatsappExists: boolean | null;
  companyName: string | null;
  avatarUrl: string | null;
  avatarSource: string | null;
  avatarSyncedAt: string | null;
  avatarSyncStatus: string | null;
  isPlatformAdmin: boolean;
  organizationId: string | null;
  orgName: string | null;
  orgRole: string | null;
  orgStatus: string | null;
  planCode: string | null;
  balanceCredits: number;
  lifetimePurchasedCredits: number;
  lifetimeUsedCredits: number;
  walletStatus: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionPlanCode: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  monthlyCreditLimit: number | null;
  dailyCreditLimit: number | null;
  allowOverage: boolean;
  overageLimitCredits: number;
  hardBlockWhenEmpty: boolean;
  alertThresholdPercent: number;
  manualAgentLimit: number | null;
  manualWhatsappInstanceLimit: number | null;
  manualUserLimit: number | null;
  storageUsedBytes: number;
  storageLimitBytes: number;
  storageAvailableBytes: number;
  storageUsedPercent: number;
  storageBillableFileCount: number;
  storageFileLimit: number;
  storageMonthlyCostBrl: number;
  storageUpdatedAt: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type BillingPlanOption = {
  id: string;
  planCode: string;
  name: string;
  status: string;
  monthlyPriceBrl: number;
  includedCredits: number;
  trialDays: number;
  agentLimit: number | null;
  whatsappInstanceLimit: number | null;
  userLimit: number | null;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type ControlAction =
  | "activate_plan"
  | "renew_plan"
  | "extend_trial"
  | "grant_credits"
  | "remove_credits"
  | "block_access"
  | "unblock_access"
  | "update_limits";

type ControlDraft = {
  action: ControlAction;
  planCode: string;
  amountCredits: string;
  days: string;
  grantIncludedCredits: boolean;
  reason: string;
  monthlyCreditLimit: string;
  dailyCreditLimit: string;
  allowOverage: boolean;
  overageLimitCredits: string;
  hardBlockWhenEmpty: boolean;
  alertThresholdPercent: string;
  agentLimit: string;
  whatsappInstanceLimit: string;
  userLimit: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  trial: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  inactive: "text-slate-400 border-slate-600/30 bg-slate-600/10",
  suspended: "text-rose-300 border-rose-400/30 bg-rose-400/10",
};

export function AdminUsersConsole({ initialSnapshot }: { initialSnapshot?: AdminUsersSnapshot }) {
  const [users, setUsers] = useState<PlatformUser[]>(() => initialSnapshot?.users ?? []);
  const [plans, setPlans] = useState<BillingPlanOption[]>(() => (initialSnapshot?.plans ?? []).filter((plan) => plan.status !== "archived"));
  const [loading, setLoading] = useState(!initialSnapshot);
  const [notice, setNotice] = useState<Notice | null>(() => (
    initialSnapshot?.warnings.length
      ? { tone: "warning", message: initialSnapshot.warnings.slice(0, 3).join(" / ") }
      : null
  ));
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [linkUserId, setLinkUserId] = useState<string | null>(null);
  const [avatarUserId, setAvatarUserId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [controlUser, setControlUser] = useState<PlatformUser | null>(null);
  const [controlDraft, setControlDraft] = useState<ControlDraft | null>(null);
  const [controlLoading, setControlLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialSnapshot) {
      return;
    }

    let cancelled = false;

    async function loadInitialData() {
      try {
        const [usersResponse, plansResponse] = await Promise.all([
          fetch("/api/admin/users", { cache: "no-store" }),
          fetch("/api/admin/billing/plans", { cache: "no-store" }),
        ]);
        const usersData = (await usersResponse.json().catch(() => null)) as { users?: PlatformUser[]; warnings?: string[]; error?: string } | null;
        const plansData = (await plansResponse.json().catch(() => null)) as { plans?: BillingPlanOption[]; error?: string } | null;

        if (!usersResponse.ok || !usersData) {
          throw new Error(usersData?.error ?? "Nao foi possivel carregar os usuarios.");
        }

        if (!plansResponse.ok || !plansData) {
          throw new Error(plansData?.error ?? "Nao foi possivel carregar os planos.");
        }

        if (!cancelled) {
          setUsers(usersData.users ?? []);
          setPlans((plansData.plans ?? []).filter((plan) => plan.status !== "archived"));

          if (usersData.warnings?.length) {
            setNotice({ tone: "warning", message: usersData.warnings.slice(0, 3).join(" / ") });
          }
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

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [initialSnapshot]);

  async function refreshUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { users?: PlatformUser[]; warnings?: string[]; error?: string } | null;

    if (!response.ok || !data) {
      throw new Error(data?.error ?? "Nao foi possivel atualizar os usuarios.");
    }

    setUsers(data.users ?? []);

    if (data.warnings?.length) {
      setNotice({ tone: "warning", message: data.warnings.slice(0, 3).join(" / ") });
    }
  }

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
      const targetUser = users.find((user) => user.id === userId) ?? null;
      const link = await getAccessLink(userId);
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token || !session.refresh_token) {
        throw new Error("Nao foi possivel guardar sua sessao admin antes de acessar o cliente.");
      }

      saveAdminImpersonationReturn({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        returnPath: `${window.location.pathname}${window.location.search}`,
        adminEmail: session.user.email ?? null,
        adminName: readUserDisplayName(session.user.user_metadata),
        targetEmail: targetUser?.email ?? null,
        targetName: getUserDisplayName(targetUser),
        startedAt: new Date().toISOString(),
      });

      window.location.assign(link!);
    } catch (error) {
      clearAdminImpersonationReturn();
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

  async function handleSyncWhatsappAvatar(userId: string) {
    setAvatarUserId(userId);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/users/avatar-from-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await response.json().catch(() => null)) as { user?: Partial<PlatformUser> & { message?: string }; message?: string; error?: string } | null;

      if (!response.ok || !data?.user) {
        throw new Error(data?.error ?? "Nao foi possivel buscar a foto do WhatsApp.");
      }

      const syncedUser = data.user;

      setUsers((current) => current.map((user) => (
        user.id === userId
          ? {
              ...user,
              ...syncedUser,
              avatarUrl: syncedUser.avatarUrl ?? user.avatarUrl,
            }
          : user
      )));
      setNotice({
        tone: syncedUser.avatarSyncStatus === "synced" ? "success" : "warning",
        message: data.message ?? (syncedUser.avatarUrl ? "Foto sincronizada." : "Foto publica nao encontrada."),
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao buscar foto do WhatsApp." });
    } finally {
      setAvatarUserId(null);
    }
  }

  function openCustomerControl(user: PlatformUser) {
    const defaultPlan = user.planCode && plans.some((plan) => plan.planCode === user.planCode)
      ? user.planCode
      : plans.find((plan) => plan.planCode !== "trial")?.planCode ?? plans[0]?.planCode ?? "";

    setControlUser(user);
    setControlDraft({
      action: "activate_plan",
      planCode: defaultPlan,
      amountCredits: "1000",
      days: "7",
      grantIncludedCredits: true,
      reason: "Ajuste comercial manual",
      monthlyCreditLimit: user.monthlyCreditLimit === null ? "" : String(user.monthlyCreditLimit),
      dailyCreditLimit: user.dailyCreditLimit === null ? "" : String(user.dailyCreditLimit),
      allowOverage: user.allowOverage,
      overageLimitCredits: String(user.overageLimitCredits ?? 0),
      hardBlockWhenEmpty: user.hardBlockWhenEmpty,
      alertThresholdPercent: String(user.alertThresholdPercent ?? 80),
      agentLimit: user.manualAgentLimit === null ? "" : String(user.manualAgentLimit),
      whatsappInstanceLimit: user.manualWhatsappInstanceLimit === null ? "" : String(user.manualWhatsappInstanceLimit),
      userLimit: user.manualUserLimit === null ? "" : String(user.manualUserLimit),
    });
  }

  async function submitCustomerControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!controlUser?.organizationId || !controlDraft) {
      setNotice({ tone: "error", message: "Este usuario nao possui empresa vinculada para controle." });
      return;
    }

    setControlLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/billing/customer-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: controlDraft.action,
          organizationId: controlUser.organizationId,
          planCode: controlDraft.planCode,
          amountCredits: Number(controlDraft.amountCredits || 0),
          days: Number(controlDraft.days || 0),
          grantIncludedCredits: controlDraft.grantIncludedCredits,
          reason: controlDraft.reason,
          limits: {
            monthlyCreditLimit: numberOrNull(controlDraft.monthlyCreditLimit),
            dailyCreditLimit: numberOrNull(controlDraft.dailyCreditLimit),
            allowOverage: controlDraft.allowOverage,
            overageLimitCredits: Number(controlDraft.overageLimitCredits || 0),
            hardBlockWhenEmpty: controlDraft.hardBlockWhenEmpty,
            alertThresholdPercent: Number(controlDraft.alertThresholdPercent || 80),
            agentLimit: numberOrNull(controlDraft.agentLimit),
            whatsappInstanceLimit: numberOrNull(controlDraft.whatsappInstanceLimit),
            userLimit: numberOrNull(controlDraft.userLimit),
          },
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel aplicar o controle.");
      }

      await refreshUsers();
      setNotice({ tone: "success", message: data.message ?? "Controle aplicado." });
      setControlUser(null);
      setControlDraft(null);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Falha ao aplicar controle." });
    } finally {
      setControlLoading(false);
    }
  }

  const filtered = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase();
        return (
          u.email?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.phoneNormalized?.toLowerCase().includes(q) ||
          u.fullName?.toLowerCase().includes(q) ||
          u.orgName?.toLowerCase().includes(q) ||
          u.companyName?.toLowerCase().includes(q)
        );
      })
    : users;
  const summary = useMemo(() => buildUsersSummary(users), [users]);

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

      <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-8">
        <UsersStatCard label="Usuarios" value={summary.totalUsers} tone="cyan" />
        <UsersStatCard label="Admins" value={summary.platformAdmins} tone="amber" />
        <UsersStatCard label="Empresas" value={summary.linkedOrganizations} tone="green" />
        <UsersStatCard label="Ativas" value={summary.activeOrganizations} tone="green" />
        <UsersStatCard label="Trial" value={summary.trialOrganizations} tone="amber" />
        <UsersStatCard label="Bloqueadas" value={summary.blockedOrganizations} tone={summary.blockedOrganizations > 0 ? "rose" : "zinc"} />
        <UsersStatCard label="Storage usado" value={formatStorageBytes(summary.storageUsedBytes)} tone="cyan" />
        <UsersStatCard label="Alertas storage" value={summary.storageOrganizationsNearLimit} tone={summary.storageOrganizationsNearLimit > 0 ? "amber" : "zinc"} />
      </div>

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
                isSyncingAvatar={avatarUserId === user.id}
                isCopied={copiedUserId === user.id}
                onAccessPanel={() => handleAccessPanel(user.id)}
                onSendLink={() => handleSendLink(user.id)}
                onSyncWhatsappAvatar={() => handleSyncWhatsappAvatar(user.id)}
                onOpenControl={() => openCustomerControl(user)}
              />
            ))}
          </div>
        )}
      </Panel>

      {controlUser && controlDraft && (
        <CustomerControlModal
          user={controlUser}
          plans={plans}
          draft={controlDraft}
          loading={controlLoading}
          onChange={(nextDraft) => setControlDraft(nextDraft)}
          onClose={() => {
            if (!controlLoading) {
              setControlUser(null);
              setControlDraft(null);
            }
          }}
          onSubmit={submitCustomerControl}
        />
      )}
    </>
  );
}

const CONTROL_ACTIONS: Array<{ action: ControlAction; label: string; description: string; icon: typeof Settings2 }> = [
  { action: "activate_plan", label: "Ativar plano", description: "Libera um plano manualmente.", icon: CheckCircle2 },
  { action: "renew_plan", label: "Renovar", description: "Abre novo ciclo e creditos.", icon: RefreshCw },
  { action: "extend_trial", label: "Dar dias gratis", description: "Estende o teste do cliente.", icon: TimerReset },
  { action: "grant_credits", label: "Enviar creditos", description: "Adiciona saldo extra.", icon: Coins },
  { action: "remove_credits", label: "Retirar creditos", description: "Debita saldo com motivo.", icon: MinusCircle },
  { action: "block_access", label: "Bloquear", description: "Pausa recursos com custo.", icon: Ban },
  { action: "unblock_access", label: "Desbloquear", description: "Reativa o cliente.", icon: CheckCircle2 },
  { action: "update_limits", label: "Limites", description: "Ajusta recursos manuais.", icon: Settings2 },
];

function UsersStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "green" | "cyan" | "amber" | "rose" | "zinc";
}) {
  return (
    <div
      className="min-w-0 rounded-xl px-3 py-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <p className="truncate font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-[20px] font-bold leading-none", statToneClass(tone))}>
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function buildUsersSummary(users: PlatformUser[]) {
  const linkedOrganizationIds = new Set(users.map((user) => user.organizationId).filter(Boolean));
  const organizations = getUniqueOrganizationUsers(users);

  return {
    totalUsers: users.length,
    platformAdmins: users.filter((user) => user.isPlatformAdmin).length,
    linkedOrganizations: linkedOrganizationIds.size,
    activeOrganizations: countOrganizationsByStatus(users, ["active"]),
    trialOrganizations: countOrganizationsByStatus(users, ["trial", "trial_pending"]),
    blockedOrganizations: countOrganizationsByStatus(users, ["inactive", "suspended", "blocked", "archived"]),
    storageUsedBytes: organizations.reduce((sum, user) => sum + user.storageUsedBytes, 0),
    storageLimitBytes: organizations.reduce((sum, user) => sum + user.storageLimitBytes, 0),
    storageMonthlyCostBrl: organizations.reduce((sum, user) => sum + user.storageMonthlyCostBrl, 0),
    storageOrganizationsNearLimit: organizations.filter((user) => user.storageUsedPercent >= 80).length,
  };
}

function getUniqueOrganizationUsers(users: PlatformUser[]) {
  const organizations = new Map<string, PlatformUser>();

  for (const user of users) {
    if (user.organizationId && !organizations.has(user.organizationId)) {
      organizations.set(user.organizationId, user);
    }
  }

  return Array.from(organizations.values());
}

function countOrganizationsByStatus(users: PlatformUser[], statuses: string[]) {
  const ids = new Set<string>();
  const statusSet = new Set(statuses);

  for (const user of users) {
    if (user.organizationId && user.orgStatus && statusSet.has(user.orgStatus)) {
      ids.add(user.organizationId);
    }
  }

  return ids.size;
}

function statToneClass(tone: "green" | "cyan" | "amber" | "rose" | "zinc") {
  if (tone === "green") return "text-emerald-400";
  if (tone === "cyan") return "text-cyan-400";
  if (tone === "amber") return "text-amber-400";
  if (tone === "rose") return "text-rose-400";
  return "text-slate-400";
}

function storageToneClass(tone: "cyan" | "amber" | "rose") {
  if (tone === "rose") return "text-rose-300";
  if (tone === "amber") return "text-amber-300";
  return "text-cyan-300";
}

function storageFillClass(tone: "cyan" | "amber" | "rose") {
  if (tone === "rose") return "bg-rose-400";
  if (tone === "amber") return "bg-amber-400";
  return "bg-cyan-400";
}

function CustomerControlModal({
  user,
  plans,
  draft,
  loading,
  onChange,
  onClose,
  onSubmit,
}: {
  user: PlatformUser;
  plans: BillingPlanOption[];
  draft: ControlDraft;
  loading: boolean;
  onChange: (draft: ControlDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedPlan = plans.find((plan) => plan.planCode === draft.planCode) ?? null;

  function update(patch: Partial<ControlDraft>) {
    onChange({ ...draft, ...patch });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-3 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border-strong)" }}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-4 py-4"
          style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border)" }}
        >
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-300">controle administrativo</p>
            <h2 className="mt-1 truncate text-[18px] font-bold text-white">{user.orgName || user.companyName || user.email}</h2>
            <p className="mt-1 text-[12px] text-slate-400">
              Plano atual {user.planCode ?? "sem plano"} / status {user.orgStatus ?? "sem status"} / {formatCredits(user.balanceCredits)} creditos.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: "var(--ch-border)" }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <ControlStat label="Saldo" value={formatCredits(user.balanceCredits)} />
              <ControlStat label="Comprados" value={formatCredits(user.lifetimePurchasedCredits)} />
              <ControlStat label="Usados" value={formatCredits(user.lifetimeUsedCredits)} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CONTROL_ACTIONS.map((item) => {
                const Icon = item.icon;
                const active = draft.action === item.action;

                return (
                  <button
                    key={item.action}
                    type="button"
                    onClick={() => update({ action: item.action })}
                    className={cn(
                      "min-h-[70px] rounded-xl border p-3 text-left transition",
                      active
                        ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                        : "border-slate-700/70 bg-slate-950/35 text-slate-300 hover:border-cyan-300/35 hover:bg-cyan-300/10",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[12px] font-semibold">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
            <div className="flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-cyan-300" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">configuracao da acao</p>
            </div>

            {(draft.action === "activate_plan" || draft.action === "renew_plan") && (
              <div className="space-y-3">
                <ControlField label="Plano">
                  <select
                    value={draft.planCode}
                    onChange={(event) => update({ planCode: event.target.value })}
                    className={controlInputClass}
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.planCode}>
                        {plan.name} / {formatMoney(plan.monthlyPriceBrl)} / {formatCredits(plan.includedCredits)} creditos
                      </option>
                    ))}
                  </select>
                </ControlField>

                {selectedPlan && (
                  <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3" style={{ borderColor: "var(--ch-border)" }}>
                    <ControlStat label="Creditos" value={formatCredits(selectedPlan.includedCredits)} compact />
                    <ControlStat label="Agentes" value={formatLimit(selectedPlan.agentLimit)} compact />
                    <ControlStat label="WhatsApps" value={formatLimit(selectedPlan.whatsappInstanceLimit)} compact />
                  </div>
                )}

                <label className="flex items-start gap-2 rounded-xl border p-3 text-[12px] text-slate-300" style={{ borderColor: "var(--ch-border)" }}>
                  <input
                    type="checkbox"
                    checked={draft.grantIncludedCredits}
                    onChange={(event) => update({ grantIncludedCredits: event.target.checked })}
                    className="mt-1"
                  />
                  <span>Conceder os creditos inclusos do plano ao confirmar esta acao.</span>
                </label>
              </div>
            )}

            {draft.action === "extend_trial" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ControlField label="Dias gratis">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draft.days}
                    onChange={(event) => update({ days: event.target.value })}
                    className={controlInputClass}
                  />
                </ControlField>
                <ControlStat label="Trial atual" value={user.trialDaysRemaining === null ? "sem ciclo" : `${user.trialDaysRemaining} dia(s)`} />
              </div>
            )}

            {(draft.action === "grant_credits" || draft.action === "remove_credits") && (
              <ControlField label={draft.action === "grant_credits" ? "Creditos para adicionar" : "Creditos para retirar"}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.amountCredits}
                  onChange={(event) => update({ amountCredits: event.target.value })}
                  className={controlInputClass}
                />
              </ControlField>
            )}

            {draft.action === "update_limits" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ControlField label="Agentes">
                  <input type="number" min="0" step="1" value={draft.agentLimit} onChange={(event) => update({ agentLimit: event.target.value })} className={controlInputClass} placeholder="usar plano" />
                </ControlField>
                <ControlField label="WhatsApps">
                  <input type="number" min="0" step="1" value={draft.whatsappInstanceLimit} onChange={(event) => update({ whatsappInstanceLimit: event.target.value })} className={controlInputClass} placeholder="usar plano" />
                </ControlField>
                <ControlField label="Usuarios">
                  <input type="number" min="0" step="1" value={draft.userLimit} onChange={(event) => update({ userLimit: event.target.value })} className={controlInputClass} placeholder="usar plano" />
                </ControlField>
                <ControlField label="Limite mensal">
                  <input type="number" min="0" step="1" value={draft.monthlyCreditLimit} onChange={(event) => update({ monthlyCreditLimit: event.target.value })} className={controlInputClass} placeholder="sem limite" />
                </ControlField>
                <ControlField label="Limite diario">
                  <input type="number" min="0" step="1" value={draft.dailyCreditLimit} onChange={(event) => update({ dailyCreditLimit: event.target.value })} className={controlInputClass} placeholder="sem limite" />
                </ControlField>
                <ControlField label="Excedente">
                  <input type="number" min="0" step="1" value={draft.overageLimitCredits} onChange={(event) => update({ overageLimitCredits: event.target.value })} className={controlInputClass} />
                </ControlField>
                <ControlField label="Alerta %">
                  <input type="number" min="0" max="100" step="1" value={draft.alertThresholdPercent} onChange={(event) => update({ alertThresholdPercent: event.target.value })} className={controlInputClass} />
                </ControlField>
                <div className="grid gap-2">
                  <ControlToggle label="Permitir excedente" checked={draft.allowOverage} onChange={(checked) => update({ allowOverage: checked })} />
                  <ControlToggle label="Bloquear sem creditos" checked={draft.hardBlockWhenEmpty} onChange={(checked) => update({ hardBlockWhenEmpty: checked })} />
                </div>
              </div>
            )}

            {(draft.action === "block_access" || draft.action === "unblock_access") && (
              <div className={cn(
                "rounded-xl border p-3 text-[12px] leading-5",
                draft.action === "block_access"
                  ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
                  : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
              )}>
                {draft.action === "block_access"
                  ? "O cliente continuara logando, mas agentes, IA, voz, WhatsApp automatico e demais recursos com custo ficam pausados."
                  : "O cliente volta ao status ativo do plano atual. Se o trial estiver vencido ou sem creditos, ainda sera necessario estender dias ou adicionar creditos."}
              </div>
            )}

            <ControlField label="Motivo">
              <textarea
                value={draft.reason}
                onChange={(event) => update({ reason: event.target.value })}
                className={`${controlInputClass} min-h-20 resize-y py-2`}
              />
            </ControlField>

            <button
              type="submit"
              disabled={loading || !user.organizationId}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 font-mono text-[11px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar acao
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const controlInputClass = "h-10 w-full rounded-lg border border-slate-700/70 bg-slate-950/55 px-3 text-[12px] text-white outline-none transition focus:border-cyan-300/50";

function ControlField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ControlToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 text-[12px] text-slate-300" style={{ borderColor: "var(--ch-border)" }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ControlStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-xl border", compact ? "p-2" : "p-3")} style={{ background: "rgba(15,23,42,0.45)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cn("mt-1 truncate font-mono font-bold text-cyan-100", compact ? "text-[13px]" : "text-[16px]")}>{value}</p>
    </div>
  );
}

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(Math.max(value, 0));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatStorageBytes(value: number) {
  const safeValue = Math.max(0, value);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let amount = safeValue;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: amount >= 10 || unitIndex === 0 ? 0 : 1,
  }).format(amount)} ${units[unitIndex]}`;
}

function formatLimit(value: number | null) {
  return value === null ? "plano" : String(value);
}

function UserRow({
  user,
  isAccessingPanel,
  isSendingLink,
  isSyncingAvatar,
  isCopied,
  onAccessPanel,
  onSendLink,
  onSyncWhatsappAvatar,
  onOpenControl,
}: {
  user: PlatformUser;
  isAccessingPanel: boolean;
  isSendingLink: boolean;
  isSyncingAvatar: boolean;
  isCopied: boolean;
  onAccessPanel: () => void;
  onSendLink: () => void;
  onSyncWhatsappAvatar: () => void;
  onOpenControl: () => void;
}) {
  const displayName = user.fullName || user.companyName || user.email?.split("@")[0] || "—";
  const statusColor = STATUS_COLORS[user.orgStatus ?? ""] ?? STATUS_COLORS["inactive"];
  const canSyncAvatar = Boolean(user.phoneNormalized || user.phone);
  const hasWhatsappAvatar = user.avatarSource === "whatsapp_profile";
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
      <UserAvatar user={user} displayName={displayName} initials={initials} />

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
          {user.phoneNormalized && (
            <p className="font-mono text-[10px] text-cyan-300/70">{formatPhonePreview(user.phoneNormalized)}</p>
          )}
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
          {user.avatarSource === "whatsapp_profile" && (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
              foto wa
            </span>
          )}
        </div>
      </div>

      {user.organizationId && (
        <StorageUsageInline user={user} />
      )}

      {user.lastSignInAt && (
        <p className="hidden shrink-0 font-mono text-[9px] text-slate-600 lg:block">
          {formatShortDate(user.lastSignInAt)}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={!canSyncAvatar || isSyncingAvatar || isSendingLink || isAccessingPanel}
          onClick={onSyncWhatsappAvatar}
          title={!canSyncAvatar ? "Cliente sem WhatsApp salvo" : hasWhatsappAvatar ? "Atualizar foto do WhatsApp" : "Buscar foto do WhatsApp"}
          aria-label={!canSyncAvatar ? "Cliente sem WhatsApp salvo" : hasWhatsappAvatar ? "Atualizar foto do WhatsApp" : "Buscar foto do WhatsApp"}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40",
            hasWhatsappAvatar
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
              : "border-cyan-400/25 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15",
          )}
        >
          {isSyncingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasWhatsappAvatar ? <RefreshCw className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          disabled={!user.organizationId || isAccessingPanel || isSendingLink || isSyncingAvatar}
          onClick={onOpenControl}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Settings2 className="h-3 w-3" />
          Controle
        </button>

        <button
          type="button"
          disabled={isSendingLink || isAccessingPanel || isSyncingAvatar}
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
          disabled={isAccessingPanel || isSendingLink || isSyncingAvatar}
          onClick={onAccessPanel}
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

function StorageUsageInline({ user }: { user: PlatformUser }) {
  const tone = user.storageUsedPercent >= 95 ? "rose" : user.storageUsedPercent >= 80 ? "amber" : "cyan";
  const usagePercent = getStorageUsagePercent(user);

  return (
    <div className="hidden w-[150px] shrink-0 xl:block" title={`${formatStorageBytes(user.storageUsedBytes)} usados de ${formatStorageBytes(user.storageLimitBytes)}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
          <HardDrive className="h-3 w-3 shrink-0" />
          Storage
        </span>
        <span className={cn("font-mono text-[9px] font-bold", storageToneClass(tone))}>{usagePercent.label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn("h-full rounded-full", storageFillClass(tone))}
          style={{ width: `${usagePercent.visualValue}%` }}
        />
      </div>
      <p className="mt-1 truncate font-mono text-[9px] text-slate-500">
        {formatStorageBytes(user.storageUsedBytes)} / {formatStorageBytes(user.storageLimitBytes)}
      </p>
    </div>
  );
}

function getStorageUsagePercent(user: Pick<PlatformUser, "storageLimitBytes" | "storageUsedBytes" | "storageUsedPercent">) {
  const rawPercent = user.storageLimitBytes > 0 ? (user.storageUsedBytes / user.storageLimitBytes) * 100 : 0;
  const hasUsage = user.storageUsedBytes > 0 && user.storageLimitBytes > 0;
  const roundedPercent = Math.max(0, Math.min(user.storageUsedPercent, 100));

  return {
    label: hasUsage && rawPercent < 1 ? "<1%" : `${roundedPercent}%`,
    visualValue: hasUsage ? Math.max(2, Math.min(rawPercent, 100)) : 0,
  };
}

function UserAvatar({ user, displayName, initials }: { user: PlatformUser; displayName: string; initials: string }) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const showImage = Boolean(user.avatarUrl && failedAvatarUrl !== user.avatarUrl);

  return (
    <div
      className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border text-[13px] font-bold"
      style={{
        background: user.isPlatformAdmin ? "rgba(34,211,238,0.12)" : "rgba(100,116,139,0.12)",
        borderColor: user.avatarSource === "whatsapp_profile" ? "rgba(52,211,153,0.35)" : "rgba(148,163,184,0.14)",
        color: user.isPlatformAdmin ? "rgb(103,232,249)" : "rgb(148,163,184)",
      }}
    >
      {showImage ? (
        <Image
          alt={`Foto de ${displayName}`}
          className="object-cover"
          fill
          onError={() => setFailedAvatarUrl(user.avatarUrl)}
          sizes="40px"
          src={user.avatarUrl!}
          unoptimized
        />
      ) : (
        initials || <User className="h-4 w-4" />
      )}
    </div>
  );
}

function formatPhonePreview(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 8) {
    return value;
  }

  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ****-${digits.slice(-4)}`;
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

function getUserDisplayName(user: PlatformUser | null) {
  if (!user) {
    return null;
  }

  return user.fullName || user.companyName || user.email?.split("@")[0] || null;
}

function readUserDisplayName(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return null;
  }

  const fullName = metadata.full_name;
  const companyName = metadata.company_name;
  const name = metadata.name;

  if (typeof fullName === "string" && fullName.trim()) {
    return fullName;
  }

  if (typeof companyName === "string" && companyName.trim()) {
    return companyName;
  }

  if (typeof name === "string" && name.trim()) {
    return name;
  }

  return null;
}
