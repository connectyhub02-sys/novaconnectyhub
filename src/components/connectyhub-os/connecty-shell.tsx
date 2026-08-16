"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  Building2,
  Camera,
  ChevronDown,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  CreditCard,
  FileCode2,
  GitBranch,
  Globe2,
  LogOut,
  Loader2,
  Menu,
  Megaphone,
  MessageCircle,
  PlugZap,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wand2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import {
  clearAdminImpersonationReturn,
  readAdminImpersonationReturn,
  type AdminImpersonationReturn,
} from "@/lib/admin-impersonation";
import { formatBrazilPhoneInput, formatCnpjInput, formatCpfInput, normalizeBrazilPhoneForApi } from "@/lib/account/input-format";
import {
  isMetaComingSoonClientHref,
  metaFeatureComingSoonMessage,
  metaFeatureComingSoonTitle,
} from "@/lib/meta/launch-status";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  tone?: AccentTone;
  badge?: string;
  badgeTone?: "green" | "amber" | "rose";
  comingSoon?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type AccentTone = "red" | "teal" | "emerald" | "sky" | "blue" | "violet" | "amber" | "rose" | "fuchsia" | "slate";

type NotificationTone = "green" | "cyan" | "amber" | "rose" | "zinc";

export type ConnectyShellNotification = {
  id: string;
  title: string;
  description: string;
  meta?: string | null;
  occurredAt?: string | null;
  tone?: NotificationTone;
};

type BillingAccessClientStatus = {
  state: "trial_active" | "trial_low_credits" | "trial_no_credits" | "trial_expired" | "paid_active" | "paid_no_credits" | "paid_expired" | "inactive";
  canUseBillableFeatures: boolean;
  balanceCredits: number;
  trialDaysRemaining: number | null;
  includedCredits: number;
  usedCredits: number;
  bannerTone: "green" | "amber" | "rose" | "cyan";
  bannerTitle: string;
  bannerDescription: string;
  ctaLabel: string;
  ctaHref: string;
};

type AccountCompletionAccountType = "person" | "company";

type AccountCompletionClientStatus = {
  isComplete: boolean;
  missingFields: string[];
  fullName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneVerified: boolean;
  phoneWhatsappExists: boolean | null;
  cpfPreview: string | null;
  documentType: "cpf" | "cnpj" | null;
  accountType: AccountCompletionAccountType | null;
  companyName: string | null;
  signupCompletedAt: string | null;
  isPlatformAdmin: boolean;
};

type WhatsappCheckState = {
  state: "idle" | "incomplete" | "checking" | "valid" | "not_found" | "error";
  phoneNormalized: string | null;
  message: string | null;
};

type ConnectyShellNotificationsContextValue = {
  setNotificationGroup: (source: string, notifications: ConnectyShellNotification[]) => void;
  clearNotificationGroup: (source: string) => void;
};

const ConnectyShellNotificationsContext = createContext<ConnectyShellNotificationsContextValue | null>(null);

export function useConnectyShellNotifications() {
  return useContext(ConnectyShellNotificationsContext);
}

type AccentPalette = {
  accent: string;
  accentRgb: string;
  accent2: string;
  accent2Rgb: string;
};

const accentPalettes: Record<AccentTone, AccentPalette> = {
  red: { accent: "#e50914", accentRgb: "229,9,20", accent2: "#111111", accent2Rgb: "17,17,17" },
  teal: { accent: "#38e8d6", accentRgb: "56,232,214", accent2: "#7dd3fc", accent2Rgb: "125,211,252" },
  emerald: { accent: "#34d399", accentRgb: "52,211,153", accent2: "#38e8d6", accent2Rgb: "56,232,214" },
  sky: { accent: "#38bdf8", accentRgb: "56,189,248", accent2: "#818cf8", accent2Rgb: "129,140,248" },
  blue: { accent: "#60a5fa", accentRgb: "96,165,250", accent2: "#38bdf8", accent2Rgb: "56,189,248" },
  violet: { accent: "#a78bfa", accentRgb: "167,139,250", accent2: "#f0abfc", accent2Rgb: "240,171,252" },
  amber: { accent: "#fbbf24", accentRgb: "251,191,36", accent2: "#fb923c", accent2Rgb: "251,146,60" },
  rose: { accent: "#fb7185", accentRgb: "251,113,133", accent2: "#f472b6", accent2Rgb: "244,114,182" },
  fuchsia: { accent: "#e879f9", accentRgb: "232,121,249", accent2: "#a78bfa", accent2Rgb: "167,139,250" },
  slate: { accent: "#cbd5e1", accentRgb: "203,213,225", accent2: "#94a3b8", accent2Rgb: "148,163,184" },
};

// ─── Navigation ───────────────────────────────────────────────────────────────

const adminSections: NavSection[] = [
  {
    label: "Operação",
    items: [
      { label: "Dashboard",   href: "/admin",              icon: BarChart3, tone: "blue" },
      { label: "Agentes",     href: "/admin/agentes",      icon: Bot, tone: "violet" },
      { label: "WhatsApp Interno", href: "/admin/whatsapp/atendimento", icon: MessageCircle, tone: "emerald" },
      { label: "Inteligencia",href: "/admin/inteligencia", icon: BrainCircuit, tone: "violet" },
      { label: "Criativos IA", href: "/admin/conteudo",     icon: Globe2, tone: "sky" },
      { label: "Setores",     href: "/admin/setores",      icon: GitBranch, tone: "teal" },
      { label: "CEO IA",      href: "/admin/ceo",          icon: Wand2, tone: "fuchsia" },
      { label: "Aprovações",  href: "/admin/aprovacoes",   icon: ShieldCheck, tone: "amber" },
    ],
  },
  {
    label: "Trafego IA",
    items: [
      { label: "Meta Ads",    href: "/admin/trafego/meta-ads",   icon: Megaphone, tone: "fuchsia" },
      { label: "Google Ads",  href: "/admin/trafego/google-ads", icon: Search, tone: "blue" },
      { label: "Visao Geral", href: "/admin/trafego",            icon: BarChart3, tone: "sky" },
    ],
  },
  {
    label: "Clientes",
    items: [
      { label: "Clientes",          href: "/admin/clientes",          icon: Users, tone: "sky" },
      { label: "CRM Leads",         href: "/admin/leads",             icon: UserCheck, tone: "emerald" },
      { label: "Automacoes",         href: "/admin/automacoes",        icon: Zap, tone: "violet" },
      { label: "Planos",            href: "/admin/planos",            icon: Coins, tone: "amber" },
      { label: "Produtos CH",       href: "/admin/produtos-connectyhub", icon: ShoppingBag, tone: "amber" },
      { label: "WhatsApp Clientes", href: "/admin/clientes/whatsapp", icon: MessageCircle, tone: "teal" },
      { label: "Integracoes",       href: "/admin/clientes/integracoes", icon: PlugZap, tone: "teal" },
      { label: "API WhatsApp",      href: "/admin/api-whatsapp",      icon: PlugZap, tone: "emerald" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Manutenção",    href: "/admin/maintenance",  icon: Wrench, tone: "rose" },
      { label: "Auditoria",     href: "/admin/auditoria",    icon: FileCode2, tone: "slate" },
      { label: "Financeiro",    href: "/admin/financeiro",   icon: CircleDollarSign, tone: "amber" },
      { label: "Configurações", href: "/admin/configuracoes",icon: SlidersHorizontal, tone: "blue" },
    ],
  },
];

const clientSections: NavSection[] = [
  {
    label: "Vendas",
    items: [
      { label: "Dashboard",    href: "/dashboard",                icon: BarChart3, tone: "blue" },
      { label: "Minha Empresa",href: "/dashboard/empresa",        icon: Building2, tone: "sky" },
      { label: "Agentes",      href: "/dashboard/whatsapp",       icon: Bot, tone: "violet" },
      { label: "Atendimento",  href: "/dashboard/atendimento",    icon: MessageCircle, tone: "red" },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { label: "Catálogo de Vendas", href: "/dashboard/links",         icon: ShoppingBag, tone: "sky" },
      { label: "Automações",      href: "/dashboard/automacoes",       icon: Zap, tone: "violet" },
      { label: "Produtos",        href: "/dashboard/produtos",         icon: ShoppingBag, tone: "amber" },
      { label: "Integrações",     href: "/dashboard/integracoes",      icon: PlugZap, tone: "teal" },
      { label: "API WhatsApp",     href: "/dashboard/api-whatsapp",     icon: PlugZap, tone: "emerald" },
      { label: "Planos",           href: "/dashboard/planos",           icon: Coins, tone: "amber" },
      { label: "Minha Conta",      href: "/dashboard/minha-conta",      icon: CreditCard, tone: "blue" },
    ],
  },
];

// ─── Shell ────────────────────────────────────────────────────────────────────

export function ConnectyShell({
  mode,
  children,
  isPlatformAdmin = false,
  workspaceName,
  userLabel,
  activeHref,
  userAvatarUrl,
  initialNotifications = [],
}: {
  mode: "admin" | "client";
  children: ReactNode;
  isPlatformAdmin?: boolean;
  workspaceName?: string;
  userLabel?: string;
  activeHref?: string;
  userAvatarUrl?: string | null;
  initialNotifications?: ConnectyShellNotification[];
}) {
  const pathname  = usePathname();
  const active    = activeHref ?? pathname ?? "/";
  const sections  = mode === "admin" ? adminSections : clientSections;
  const activeItem = resolveActiveItem(sections, active);
  const activeTone: AccentTone = "red";
  const activePalette = accentPalettes[activeTone];
  const accent    = activePalette.accent;
  const accentRgb = activePalette.accentRgb;
  const accent2   = activePalette.accent2;
  const accent2Rgb = activePalette.accent2Rgb;
  const name      = mode === "admin" ? "ConnectyHub" : (workspaceName ?? "Minha empresa");
  const role      = mode === "admin" ? "Platform Admin" : (userLabel ?? "workspace");
  const switchTo  = mode === "admin" ? "/dashboard" : "/admin";
  const switchLbl = mode === "admin" ? "Client OS" : "Admin OS";
  const canSwitch = mode === "admin" || isPlatformAdmin;
  const pageLabel = activeItem?.label ?? "Dashboard";
  const mobileDockItems = getMobileDockItems(sections, mode);
  const logoTone  = "blue";
  const isAccountPage = active === "/dashboard/minha-conta" || active.startsWith("/dashboard/minha-conta/");
  const [avatarUrl, setAvatarUrl] = useState(userAvatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [comingSoonItem, setComingSoonItem] = useState<NavItem | null>(null);
  const [notificationGroups, setNotificationGroups] = useState<Record<string, ConnectyShellNotification[]>>({});
  const [billingAccess, setBillingAccess] = useState<BillingAccessClientStatus | null>(null);
  const [accountCompletion, setAccountCompletion] = useState<AccountCompletionClientStatus | null>(null);
  const [accountCompletionChecked, setAccountCompletionChecked] = useState(mode !== "client");
  const [, setAccountCompletionDismissed] = useState(false);
  const [trialReminderState, setTrialReminderState] = useState<{ key: string | null; dismissed: boolean | null }>({
    key: null,
    dismissed: null,
  });

  useEffect(() => {
    function handleAvatarUpdated(event: Event) {
      const detail = (event as CustomEvent<{ avatarUrl?: string | null }>).detail;

      if (detail?.avatarUrl) {
        setAvatarUrl(detail.avatarUrl);
      }
    }

    window.addEventListener("connectyhub:avatar-updated", handleAvatarUpdated);

    return () => window.removeEventListener("connectyhub:avatar-updated", handleAvatarUpdated);
  }, []);

  const accountCompletionPending = mode === "client" && accountCompletion?.isComplete === false;
  const accountCompletionGateActive = mode === "client" && (!accountCompletionChecked || accountCompletionPending);
  const trialReminderStatus = billingAccess
    && billingAccess.balanceCredits > 0
    && (billingAccess.state === "trial_active" || billingAccess.state === "trial_low_credits")
    ? billingAccess
    : null;
  const trialReminderMilestone = trialReminderStatus
    ? Math.floor(Math.max(trialReminderStatus.usedCredits, 0) / 100) * 100
    : 0;
  const trialReminderStorageKey = useMemo(() => {
    if (mode !== "client" || !accountCompletion?.isComplete || !accountCompletion.signupCompletedAt) {
      return null;
    }

    const identity = accountCompletion.email ?? accountCompletion.phoneNormalized ?? accountCompletion.phone ?? "client";

    return `connectyhub:trial-bonus-reminder:${identity}:${accountCompletion.signupCompletedAt}:${trialReminderMilestone}`;
  }, [
    accountCompletion?.email,
    accountCompletion?.isComplete,
    accountCompletion?.phone,
    accountCompletion?.phoneNormalized,
    accountCompletion?.signupCompletedAt,
    mode,
    trialReminderMilestone,
  ]);
  const trialReminderReady = trialReminderState.key === trialReminderStorageKey && trialReminderState.dismissed === false;
  const showTrialReminder = mode === "client"
    && !accountCompletionPending
    && accountCompletion?.isComplete === true
    && trialReminderReady
    && trialReminderStatus !== null;

  const setNotificationGroup = useCallback((source: string, notifications: ConnectyShellNotification[]) => {
    setNotificationGroups((current) => {
      const next = { ...current };

      if (notifications.length === 0) {
        delete next[source];
      } else {
        next[source] = notifications;
      }

      return next;
    });
  }, []);

  const clearNotificationGroup = useCallback((source: string) => {
    setNotificationGroups((current) => {
      if (!current[source]) {
        return current;
      }

      const next = { ...current };
      delete next[source];
      return next;
    });
  }, []);

  const shellNotificationContext = useMemo(
    () => ({ setNotificationGroup, clearNotificationGroup }),
    [clearNotificationGroup, setNotificationGroup],
  );
  const notifications = useMemo(
    () => [
      ...initialNotifications,
      ...Object.values(notificationGroups).flat(),
    ].sort((left, right) => dateTime(right.occurredAt) - dateTime(left.occurredAt)),
    [initialNotifications, notificationGroups],
  );
  const notificationCount = notifications.length;

  useEffect(() => {
    if (mode !== "client") {
      return;
    }

    let cancelled = false;

    async function loadBillingAccess() {
      try {
        const response = await fetch("/api/dashboard/billing/status", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { billingAccess?: BillingAccessClientStatus } | null;

        if (!cancelled && response.ok && data?.billingAccess) {
          setBillingAccess(data.billingAccess);
        }
      } catch {
        if (!cancelled) {
          setBillingAccess(null);
        }
      }
    }

    void loadBillingAccess();
    const intervalId = window.setInterval(loadBillingAccess, 15_000);

    function refreshOnFocus() {
      void loadBillingAccess();
    }

    function refreshOnVisibility() {
      if (document.visibilityState === "visible") {
        void loadBillingAccess();
      }
    }

    function refreshOnBillingEvent() {
      void loadBillingAccess();
    }

    function syncBillingStatus(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;

      if (detail && typeof detail === "object" && typeof detail.state === "string") {
        setBillingAccess(detail as BillingAccessClientStatus);
      }
    }

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("connectyhub:billing-refresh", refreshOnBillingEvent);
    window.addEventListener("connectyhub:billing-status", syncBillingStatus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("connectyhub:billing-refresh", refreshOnBillingEvent);
      window.removeEventListener("connectyhub:billing-status", syncBillingStatus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "client") {
      return;
    }

    let cancelled = false;

    async function loadAccountCompletion() {
      try {
        const response = await fetch("/api/account/completion", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as {
          accountCompletion?: AccountCompletionClientStatus;
        } | null;

        if (!cancelled && response.ok && data?.accountCompletion) {
          setAccountCompletion(data.accountCompletion);
          setAccountCompletionDismissed(data.accountCompletion.isComplete);
        }
      } catch {
        if (!cancelled) {
          setAccountCompletion(null);
        }
      } finally {
        if (!cancelled) {
          setAccountCompletionChecked(true);
        }
      }
    }

    void loadAccountCompletion();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "client") {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);

      if (response.status === 402 || response.status === 428) {
        const data = (await response.clone().json().catch(() => null)) as {
          accountCompletion?: AccountCompletionClientStatus;
          billingAccess?: BillingAccessClientStatus;
        } | null;

        if (response.status === 428 && data?.accountCompletion) {
          setAccountCompletion(data.accountCompletion);
          setAccountCompletionChecked(true);
          setAccountCompletionDismissed(false);
        }

        if (data?.billingAccess) {
          setBillingAccess(data.billingAccess);
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "client" || !trialReminderStorageKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      let dismissed = false;

      try {
        dismissed = window.localStorage.getItem(trialReminderStorageKey) === "1";
      } catch {
        dismissed = false;
      }

      setTrialReminderState({ key: trialReminderStorageKey, dismissed });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [mode, trialReminderStorageKey]);

  const handleTrialReminderClose = useCallback(() => {
    if (trialReminderStorageKey) {
      try {
        window.localStorage.setItem(trialReminderStorageKey, "1");
      } catch {
        // Ignore local storage failures; the modal can be dismissed for this session.
      }
    }

    setTrialReminderState({ key: trialReminderStorageKey, dismissed: true });
  }, [trialReminderStorageKey]);

  const handleComingSoonClick = useCallback((item: NavItem) => {
    setComingSoonItem(item);
    setMobileMenuOpen(false);
  }, []);

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("avatar", file);
    setAvatarUploading(true);
    setAvatarError(null);

    try {
      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as { avatarUrl?: string; error?: string } | null;

      if (!response.ok || !data?.avatarUrl) {
        throw new Error(data?.error ?? "Nao foi possivel trocar a foto.");
      }

      setAvatarUrl(data.avatarUrl);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Erro ao trocar foto.");
    } finally {
      setAvatarUploading(false);
    }
  }

  const shellTheme = {
    background: "radial-gradient(circle at 100% -10%, rgba(var(--ch-accent-rgb),0.13) 0%, transparent 26rem), radial-gradient(circle at 0% 15%, rgba(17,17,17,0.055) 0%, transparent 28rem), linear-gradient(180deg, #fbfbfc 0%, var(--ch-bg) 48%, #f1f1f3 100%)",
    colorScheme: "light",
    "--ch-bg":         "#f5f5f6",
    "--ch-surface":    "rgba(255,255,255,0.97)",
    "--ch-surface-2":  "#f1f1f3",
    "--ch-surface-3":  "#e9e9ec",
    "--ch-border":     "rgba(17,17,17,0.10)",
    "--ch-border-soft":"rgba(17,17,17,0.07)",
    "--ch-border-strong":"rgba(17,17,17,0.15)",
    "--ch-brand-blue": "#01004c",
    "--ch-accent":     accent,
    "--ch-accent-rgb": accentRgb,
    "--ch-accent-2":   accent2,
    "--ch-accent-2-rgb": accent2Rgb,
    "--ch-panel":      "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(247,247,248,0.94)), rgba(255,255,255,0.96)",
    "--ch-panel-2":    "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--ch-accent-rgb),0.024)), #fafafa",
    "--ch-text":       "#111111",
    "--ch-text-rgb":   "17,17,17",
    "--ch-muted":      "#5f6368",
    "--ch-subtle":     "#8a8f98",
    "--ch-hover":      "rgba(var(--ch-accent-rgb),0.075)",
    "--ch-dropdown-bg":"rgba(255,255,255,0.98)",
    "--background":    "#f5f5f6",
    "--foreground":    "#111111",
    "--card":          "#ffffff",
    "--card-foreground":"#111111",
    "--popover":       "#ffffff",
    "--popover-foreground":"#111111",
    "--primary":       accent,
    "--primary-foreground":"#ffffff",
    "--secondary":     "#f1f1f3",
    "--secondary-foreground":"#111111",
    "--muted":         "#f1f1f3",
    "--muted-foreground":"#5f6368",
    "--accent":        "#ededf0",
    "--accent-foreground":"#111111",
    "--border":        "rgba(17,17,17,0.10)",
    "--input":         "rgba(17,17,17,0.14)",
    "--ring":          `rgba(${accentRgb},0.36)`,
  } as CSSProperties;

  return (
    <ConnectyShellNotificationsContext.Provider value={shellNotificationContext}>
      <div
        className="connecty-shell flex min-h-svh"
        data-connecty-accent={activeTone}
        data-connecty-mode={mode}
        style={shellTheme}
      >
      {/* ── Sidebar ── */}
      <aside
        className="sticky top-0 hidden h-svh w-[240px] shrink-0 flex-col lg:flex"
        style={{
          background:  "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,246,247,0.96))",
          borderRight: "1px solid var(--ch-border-strong)",
          boxShadow: "14px 0 42px rgba(17,17,17,0.045)",
          backdropFilter: "blur(18px)",
        }}
      >
        {/* Brand */}
        <div
          className="flex h-[60px] items-center gap-3 px-5"
          style={{ borderBottom: "1px solid var(--ch-border-strong)" }}
        >
          <Link href="/" className="min-w-0 flex-1">
            <ConnectyLogo className="h-[22px] w-[170px]" tone={logoTone} type="full" />
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--ch-accent)" }}>
              {mode === "admin" ? "Admin OS" : "Client OS"}
            </div>
          </Link>
          <div
            className="ml-auto h-2 w-2 rounded-full"
            style={{ background: "var(--ch-accent)", boxShadow: `0 0 8px var(--ch-accent)` }}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <div
                className="mb-2 px-2 font-mono text-[9px] uppercase tracking-[0.2em]"
                style={{ color: "var(--ch-subtle)" }}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    isActive={item.href === activeItem?.href}
                    onComingSoonClick={handleComingSoonClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Identity */}
        <div className="p-3" style={{ borderTop: "1px solid var(--ch-border-strong)" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition outline-none"
                style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--ch-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[11px] font-bold"
                  style={{ background: `rgba(var(--ch-accent-rgb),0.15)`, color: "var(--ch-accent)" }}
                >
                  <AccountAvatar avatarUrl={avatarUrl} logoTone={logoTone} mode={mode} name={name} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{name}</div>
                  <div className="truncate font-mono text-[9px]" style={{ color: "var(--ch-muted)" }}>{role}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ch-muted)" }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={14}
              className="z-[9999] rounded-2xl p-2 shadow-2xl"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(244,249,253,0.98) 100%)",
                border: "1px solid var(--ch-border-strong)",
                boxShadow: "0 28px 90px rgba(15,23,42,0.16)",
                color: "var(--ch-text)",
                maxWidth: "340px",
                minWidth: "280px",
                width: "calc(100vw - 40px)",
              }}
            >
              <DropdownMenuLabel
                className="rounded-xl px-3 py-3 text-xs"
                style={{ background: "rgba(var(--ch-accent-rgb),0.08)", color: "var(--ch-text)" }}
              >
                Conta
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2" style={{ background: "var(--ch-border)" }} />
              {mode === "client" && (
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                  <Link
                    href="/dashboard/minha-conta"
                    className="mb-1 flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                    style={{ background: "rgba(255,255,255,0.72)", color: "var(--ch-text)", border: "1px solid var(--ch-border)" }}
                  >
                    <CreditCard className="mr-2 h-3.5 w-3.5" />
                    Minha conta
                  </Link>
                </DropdownMenuItem>
              )}
              {mode === "client" && (
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                  <label
                    className="flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                    style={{ background: "rgba(255,255,255,0.72)", color: "var(--ch-text)", border: "1px solid var(--ch-border)" }}
                  >
                    {avatarUploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-2 h-3.5 w-3.5" />}
                    Trocar foto
                    <input accept="image/jpeg,image/png,image/webp" className="hidden" type="file" onChange={handleAvatarUpload} />
                  </label>
                </DropdownMenuItem>
              )}
              {avatarError ? (
                <DropdownMenuLabel className="text-[11px] font-normal leading-4 text-rose-300">{avatarError}</DropdownMenuLabel>
              ) : null}
              {canSwitch && (
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                  <Link
                    href={switchTo}
                    className="flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                    style={{ background: "rgba(255,255,255,0.72)", color: "var(--ch-text)", border: "1px solid var(--ch-border)" }}
                  >
                    {switchLbl}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                asChild
                variant="destructive"
                className="cursor-pointer rounded-xl p-0 text-[13px] font-bold"
              >
                <a
                  href="/auth/signout"
                  className="flex h-11 w-full items-center rounded-xl px-3"
                  style={{ background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.24)", color: "#be123c" }}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Sair
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-40 flex h-[60px] items-center gap-3 px-3 sm:px-4 lg:px-6"
          style={{
            background:    "rgba(255,255,255,0.76)",
            backdropFilter:"blur(18px)",
            borderBottom:  "1px solid var(--ch-border-strong)",
            boxShadow: "0 12px 38px rgba(17,17,17,0.045)",
          }}
        >
          {/* Mobile brand */}
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: `rgba(var(--ch-accent-rgb),0.15)` }}>
              <ConnectyLogo className="h-5 w-5" tone={logoTone} type="mark" />
            </div>
          </Link>

          <div className="min-w-0 lg:hidden">
            <div className="truncate text-[13px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>{pageLabel}</div>
            <div className="truncate font-mono text-[8px] uppercase tracking-widest" style={{ color: "var(--ch-muted)" }}>
              {mode === "admin" ? "Admin OS" : "Client OS"}
            </div>
          </div>

          {/* Page title */}
          <div className="hidden lg:block">
            <div className="text-[15px] font-semibold" style={{ color: "var(--ch-text)" }}>{pageLabel}</div>
            <div className="font-mono text-[9px]" style={{ color: "var(--ch-muted)" }}>
              {mode === "admin" ? "admin" : "workspace"} / {pageLabel.toLowerCase()}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Search */}
            <div className="relative hidden lg:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--ch-muted)" }} />
              <input
                type="text"
                placeholder="Pesquisar..."
                className="h-8 w-[220px] rounded-lg pl-9 pr-3 text-[12px] outline-none"
                style={{
                  color:      "var(--ch-text)",
                  background: "var(--ch-surface-3)",
                  border:     "1px solid var(--ch-border-strong)",
                }}
              />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                aria-label={notificationCount > 0 ? `${notificationCount} notificacoes` : "Notificacoes"}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg transition"
                onClick={() => setNotificationsOpen((current) => !current)}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--ch-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--ch-surface-2)")}
                style={{ background: notificationsOpen ? "var(--ch-hover)" : "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <Bell className="h-4 w-4" style={{ color: notificationCount > 0 ? "var(--ch-accent)" : "var(--ch-muted)" }} />
                {notificationCount > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[8px] font-bold leading-none text-slate-950"
                    style={{ background: "var(--ch-accent)", boxShadow: `0 0 8px var(--ch-accent)` }}
                  >
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div
                  className="absolute right-0 top-10 z-[9999] w-[min(360px,calc(100vw-24px))] rounded-2xl p-3 shadow-2xl"
                  role="dialog"
                  aria-label="Notificacoes"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(244,249,253,0.98) 100%)",
                    border: "1px solid var(--ch-border-strong)",
                    boxShadow: "0 28px 90px rgba(15,23,42,0.16)",
                    color: "var(--ch-text)",
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                        Notificacoes
                      </p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: "var(--ch-muted)" }}>
                        {notificationCount > 0 ? `${notificationCount} alerta${notificationCount === 1 ? "" : "s"}` : "sem alertas"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Fechar notificacoes"
                      className="grid h-7 w-7 place-items-center rounded-lg transition"
                      onClick={() => setNotificationsOpen(false)}
                      style={{ background: "rgba(var(--ch-accent-rgb),0.08)", border: "1px solid var(--ch-border)" }}
                    >
                      <X className="h-3.5 w-3.5" style={{ color: "var(--ch-muted)" }} />
                    </button>
                  </div>

                  {notificationCount > 0 ? (
                    <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
                      {notifications.slice(0, 12).map((notification) => (
                        <div
                          key={notification.id}
                          className="rounded-xl p-3"
                          style={{
                            background: "rgba(255,255,255,0.72)",
                            border: `1px solid ${notificationToneBorder(notification.tone)}`,
                          }}
                        >
                          <div className="flex gap-2.5">
                            <span
                              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                background: notificationToneBackground(notification.tone),
                                color: notificationToneColor(notification.tone),
                              }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                                {notification.title}
                              </p>
                              <p className="mt-1 text-[11px] leading-5 text-slate-400">
                                {notification.description}
                              </p>
                              {notification.meta ? (
                                <p className="mt-2 truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
                                  {notification.meta}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl px-3 py-4 text-[12px] leading-5 text-slate-500" style={{ background: "rgba(var(--ch-accent-rgb),0.06)" }}>
                      Nenhuma notificacao ativa.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {mode === "client" ? (
              accountCompletionPending ? <AccountCompletionPill /> : <CreditBalancePill status={billingAccess} />
            ) : null}

            {/* Mode switch */}
            {canSwitch && (
              <Link
                href={switchTo}
                className="hidden h-8 items-center rounded-lg px-3 font-mono text-[10px] uppercase tracking-wide transition md:flex"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
              >
                {switchLbl}
              </Link>
            )}

            {/* Mode badge */}
            <span
              className="hidden h-7 items-center rounded-lg px-3 font-mono text-[10px] uppercase tracking-wider md:flex"
              style={{
                background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.16), rgba(var(--ch-accent-2-rgb),0.10))",
                border:     `1px solid rgba(var(--ch-accent-rgb),0.34)`,
                color:      "var(--ch-accent)",
              }}
            >
              {mode === "admin" ? "Admin OS" : "Client OS"}
            </span>

            {/* Avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold outline-none"
                style={{
                  background: `rgba(var(--ch-accent-rgb),0.15)`,
                  color:      "var(--ch-accent)",
                }}
              >
                <AccountAvatar avatarUrl={avatarUrl} logoTone={logoTone} mode={mode} name={name} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={14}
                className="z-[9999] rounded-2xl p-2 shadow-2xl"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(244,249,253,0.98) 100%)",
                  border: "1px solid var(--ch-border-strong)",
                  boxShadow: "0 28px 90px rgba(15,23,42,0.16)",
                  color: "var(--ch-text)",
                  maxWidth: "340px",
                  minWidth: "280px",
                  width: "calc(100vw - 40px)",
                }}
              >
                <DropdownMenuLabel
                  className="rounded-xl px-3 py-3 text-xs"
                  style={{ background: "rgba(var(--ch-accent-rgb),0.08)" }}
                >
                  <div className="truncate text-[14px] font-bold leading-5" style={{ color: "var(--ch-text)" }}>{name}</div>
                  <div className="truncate font-mono text-[10px] font-normal uppercase tracking-wide" style={{ color: "var(--ch-muted)" }}>{role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-2" style={{ background: "var(--ch-border)" }} />
                {mode === "client" && (
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                    <Link
                      href="/dashboard/minha-conta"
                      className="mb-1 flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                      style={{ background: "rgba(255,255,255,0.72)", color: "var(--ch-text)", border: "1px solid var(--ch-border)" }}
                    >
                      <CreditCard className="mr-2 h-3.5 w-3.5" />
                      Minha conta
                    </Link>
                  </DropdownMenuItem>
                )}
                {mode === "client" && (
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                    <label
                      className="flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                      style={{ background: "rgba(255,255,255,0.72)", color: "var(--ch-text)", border: "1px solid var(--ch-border)" }}
                    >
                      {avatarUploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-2 h-3.5 w-3.5" />}
                      Trocar foto
                      <input accept="image/jpeg,image/png,image/webp" className="hidden" type="file" onChange={handleAvatarUpload} />
                    </label>
                  </DropdownMenuItem>
                )}
                {avatarError ? (
                  <DropdownMenuLabel className="text-[11px] font-normal leading-4 text-rose-300">{avatarError}</DropdownMenuLabel>
                ) : null}
                {canSwitch && (
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                    <Link
                      href={switchTo}
                      className="flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                      style={{ background: "rgba(255,255,255,0.72)", color: "var(--ch-text)", border: "1px solid var(--ch-border)" }}
                    >
                      {switchLbl}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  asChild
                  variant="destructive"
                  className="cursor-pointer rounded-xl p-0 text-[13px] font-bold"
                >
                  <a
                    href="/auth/signout"
                    className="flex h-11 w-full items-center rounded-xl px-3"
                    style={{ background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.24)", color: "#be123c" }}
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />Sair
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {mobileMenuOpen ? (
          <MobileAppMenu
            active={active}
            activeItem={activeItem}
            logoTone={logoTone}
            mode={mode}
            name={name}
            pageLabel={pageLabel}
            role={role}
            sections={sections}
            onComingSoonClick={handleComingSoonClick}
            onClose={() => setMobileMenuOpen(false)}
          />
        ) : null}

        {!mobileMenuOpen ? (
          <MobileDock
            active={active}
            items={mobileDockItems}
            mode={mode}
            onComingSoonClick={handleComingSoonClick}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
        ) : null}

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {mode === "client" ? <AdminImpersonationBanner /> : null}
          {mode === "client" && !accountCompletionGateActive && !isAccountPage ? <BillingStatusBanner status={billingAccess} /> : null}
          <div
            className={cn(
              "connecty-shell-content mx-auto w-full max-w-[1680px] px-3 sm:px-4 lg:px-8",
              isAccountPage
                ? "connecty-shell-content--compact pt-3 sm:pt-3 lg:px-6 lg:py-3"
                : "pt-4 sm:pt-5 lg:py-6",
            )}
          >
            {children}
          </div>
        </main>
      </div>
      {mode === "client" && !accountCompletionGateActive && active !== "/dashboard/planos" ? (
        <BillingAccessLockOverlay status={billingAccess} />
      ) : null}
      {mode === "client" ? (
        <AccountCompletionModal
          key={accountCompletion
            ? [
                accountCompletion.email,
                accountCompletion.phone,
                accountCompletion.cpfPreview,
                accountCompletion.accountType,
                accountCompletion.companyName,
                accountCompletion.missingFields.join("|"),
              ].join(":")
            : "account-completion-empty"}
          status={accountCompletion}
          onAvatarSynced={setAvatarUrl}
          onCompleted={(nextStatus) => {
            setAccountCompletion(nextStatus);
            setAccountCompletionChecked(true);
            setAccountCompletionDismissed(nextStatus.isComplete);
          }}
        />
      ) : null}
      {showTrialReminder && trialReminderStatus ? (
        <TrialWelcomeModal
          status={trialReminderStatus}
          milestoneCredits={trialReminderMilestone}
          onClose={handleTrialReminderClose}
        />
      ) : null}
      {comingSoonItem ? (
        <ShellComingSoonModal
          item={comingSoonItem}
          onClose={() => setComingSoonItem(null)}
        />
      ) : null}
      </div>
    </ConnectyShellNotificationsContext.Provider>
  );
}

function ShellComingSoonModal({
  item,
  onClose,
}: {
  item: NavItem;
  onClose: () => void;
}) {
  const Icon = item.icon;

  return (
    <div
      aria-labelledby="shell-coming-soon-title"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      role="dialog"
      tabIndex={0}
      style={{ background: "rgba(15,23,42,0.30)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-cyan-300/25 p-5 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,249,253,0.96))",
          color: "var(--ch-text)",
          boxShadow: "0 28px 90px rgba(15,23,42,0.16)",
        }}
      >
        <button
          aria-label="Fechar aviso"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:text-cyan-700"
          onClick={onClose}
          type="button"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-700">
          <Icon className="h-6 w-6" />
        </div>

        <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-700">
          Em breve
        </p>
        <h3 id="shell-coming-soon-title" className="mt-2 pr-8 text-lg font-semibold" style={{ color: "var(--ch-text)" }}>
          {metaFeatureComingSoonTitle}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {metaFeatureComingSoonMessage}
        </p>
        <p className="mt-3 rounded-lg border px-3 py-2 text-xs leading-5 text-slate-500" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
          Area selecionada: {item.label}. O atendimento principal continua liberado pelo WhatsApp.
        </p>

        <button
          className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-white px-4 font-mono text-[11px] font-semibold uppercase text-slate-950 transition hover:bg-slate-100"
          onClick={onClose}
          type="button"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

function CreditBalancePill({ status }: { status: BillingAccessClientStatus | null }) {
  const tone = status ? billingBannerTone(status.bannerTone) : billingBannerTone("cyan");
  const label = status ? formatShellCredits(status.balanceCredits) : "--";

  return (
    <div
      className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase tracking-wide sm:px-3"
      title="Creditos disponiveis"
      style={{
        background: status?.canUseBillableFeatures === false ? "rgba(251,113,133,0.14)" : "var(--ch-surface-2)",
        border: `1px solid ${status?.canUseBillableFeatures === false ? "rgba(251,113,133,0.42)" : "var(--ch-border)"}`,
        color: status?.canUseBillableFeatures === false ? "#fb7185" : tone.color,
      }}
    >
      <Coins className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Creditos</span>
      <span>{label}</span>
    </div>
  );
}

function AccountCompletionPill() {
  return (
    <div
      className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase tracking-wide sm:px-3"
      title="Cadastro pendente"
      style={{
        background: "rgba(251,113,133,0.14)",
        border: "1px solid rgba(251,113,133,0.42)",
        color: "#fb7185",
      }}
    >
      <UserCheck className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Cadastro</span>
      <span>Pendente</span>
    </div>
  );
}

function AccountCompletionModal({
  status,
  onAvatarSynced,
  onCompleted,
}: {
  status: AccountCompletionClientStatus | null;
  onAvatarSynced: (avatarUrl: string) => void;
  onCompleted: (status: AccountCompletionClientStatus) => void;
}) {
  const [fullName, setFullName] = useState(status?.fullName ?? "");
  const [accountType, setAccountType] = useState<AccountCompletionAccountType>(status?.accountType === "company" ? "company" : "person");
  const [companyName, setCompanyName] = useState(status?.companyName ?? "");
  const [phone, setPhone] = useState(formatBrazilPhoneInput(status?.phone ?? ""));
  const [documentValue, setDocumentValue] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"profile" | "code">("profile");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remoteWhatsappCheck, setRemoteWhatsappCheck] = useState<WhatsappCheckState | null>(null);

  const currentPhoneForVerification = normalizeBrazilPhoneForApi(phone);
  const documentType = accountType === "company" ? "cnpj" : "cpf";
  const documentLabel = accountType === "company" ? "CNPJ" : "CPF";
  const whatsappCheck = useMemo<WhatsappCheckState>(() => {
    if (!phone.trim()) {
      return {
        state: "idle",
        phoneNormalized: null,
        message: "Digite DDD + numero para validar o WhatsApp.",
      };
    }

    if (!currentPhoneForVerification) {
      const localLength = getBrazilPhoneLocalDigitCount(phone);

      return {
        state: "incomplete",
        phoneNormalized: null,
        message: localLength >= 10
          ? "Use um WhatsApp valido com DDD. Ex.: (47) 99999-9999."
          : "Complete o WhatsApp com DDD para validar.",
      };
    }

    if (status?.phoneVerified && status.phoneWhatsappExists && status.phoneNormalized === currentPhoneForVerification) {
      return {
        state: "valid",
        phoneNormalized: currentPhoneForVerification,
        message: "WhatsApp ja confirmado neste cadastro.",
      };
    }

    if (remoteWhatsappCheck?.phoneNormalized === currentPhoneForVerification) {
      return remoteWhatsappCheck;
    }

    return {
      state: "idle",
      phoneNormalized: currentPhoneForVerification,
      message: "Aguardando validacao do WhatsApp.",
    };
  }, [
    currentPhoneForVerification,
    phone,
    remoteWhatsappCheck,
    status?.phoneNormalized,
    status?.phoneVerified,
    status?.phoneWhatsappExists,
  ]);
  const whatsappValidated = whatsappCheck.state === "valid" && whatsappCheck.phoneNormalized === currentPhoneForVerification;

  useEffect(() => {
    if (!status || status.isComplete || step !== "profile" || !currentPhoneForVerification) {
      return;
    }

    if (status.phoneVerified && status.phoneWhatsappExists && status.phoneNormalized === currentPhoneForVerification) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteWhatsappCheck({
        state: "checking",
        phoneNormalized: currentPhoneForVerification,
        message: "Verificando se este numero possui WhatsApp...",
      });

      try {
        const response = await fetch("/api/account/phone-verification/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: currentPhoneForVerification }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          exists?: boolean;
          error?: string;
          phoneNormalized?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.error ?? "Nao foi possivel validar o WhatsApp.");
        }

        if (data?.exists) {
          setRemoteWhatsappCheck({
            state: "valid",
            phoneNormalized: data.phoneNormalized ?? currentPhoneForVerification,
            message: "WhatsApp encontrado. Agora voce pode enviar o codigo.",
          });
          return;
        }

        setRemoteWhatsappCheck({
          state: "not_found",
          phoneNormalized: currentPhoneForVerification,
          message: "Nao encontramos WhatsApp ativo neste numero.",
        });
      } catch (checkError) {
        if (checkError instanceof Error && checkError.name === "AbortError") {
          return;
        }

        setRemoteWhatsappCheck({
          state: "error",
          phoneNormalized: currentPhoneForVerification,
          message: checkError instanceof Error ? checkError.message : "Nao foi possivel validar o WhatsApp.",
        });
      }
    }, 650);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    currentPhoneForVerification,
    status,
    status?.isComplete,
    status?.phoneNormalized,
    status?.phoneVerified,
    status?.phoneWhatsappExists,
    step,
  ]);

  if (!status || status.isComplete) {
    return null;
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setMessage(null);

    try {
      const phoneForVerification = normalizeBrazilPhoneForApi(phone);

      if (!phoneForVerification) {
        throw new Error("Informe um WhatsApp valido com DDD. Ex.: (47) 99999-9999.");
      }

      if (accountType === "company" && companyName.trim().length < 2) {
        throw new Error("Informe o nome da empresa.");
      }

      if (whatsappCheck.state !== "valid" || whatsappCheck.phoneNormalized !== phoneForVerification) {
        throw new Error("Valide um WhatsApp ativo antes de enviar o codigo.");
      }

      if (password.trim()) {
        if (password.trim().length < 6) {
          throw new Error("A senha precisa ter no minimo 6 caracteres.");
        }

        const supabase = createClient();
        const { error: passwordError } = await supabase.auth.updateUser({ password: password.trim() });

        if (passwordError) {
          throw new Error(passwordError.message);
        }
      }

      const profileResponse = await fetch("/api/account/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          companyName: accountType === "company" ? companyName : null,
          accountType,
          document: documentValue,
          documentType,
          passwordSet: Boolean(password.trim()),
        }),
      });
      const profileData = (await profileResponse.json().catch(() => null)) as {
        accountCompletion?: AccountCompletionClientStatus;
        error?: string;
      } | null;

      if (!profileResponse.ok || !profileData?.accountCompletion) {
        throw new Error(profileData?.error ?? "Nao foi possivel salvar o cadastro.");
      }

      const currentPhoneNormalized = status?.phoneNormalized ?? normalizeBrazilPhoneForApi(status?.phone);

      if (profileData.accountCompletion.isComplete && currentPhoneNormalized === phoneForVerification) {
        onCompleted(profileData.accountCompletion);
        return;
      }

      const phoneResponse = await fetch("/api/account/phone-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneForVerification }),
      });
      const phoneData = (await phoneResponse.json().catch(() => null)) as { error?: string } | null;

      if (!phoneResponse.ok) {
        throw new Error(phoneData?.error ?? "Nao foi possivel enviar o codigo no WhatsApp.");
      }

      setStep("code");
      setMessage("Codigo enviado no WhatsApp. Confira a conversa do numero informado.");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Nao foi possivel completar o cadastro.");
    } finally {
      setWorking(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);

    try {
      const response = await fetch("/api/account/phone-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as {
        accountCompletion?: AccountCompletionClientStatus;
        avatarUrl?: string | null;
        error?: string;
      } | null;

      if (!response.ok || !data?.accountCompletion) {
        throw new Error(data?.error ?? "Nao foi possivel validar o codigo.");
      }

      if (data.avatarUrl) {
        onAvatarSynced(data.avatarUrl);
      }

      onCompleted(data.accountCompletion);
      window.location.reload();
    } catch (codeError) {
      setError(codeError instanceof Error ? codeError.message : "Codigo invalido.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center px-4 py-6 backdrop-blur-md" style={{ background: "rgba(15,23,42,0.34)" }}>
      <div
        className="w-full max-w-[560px] rounded-2xl p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Complete seu cadastro"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(244,249,253,0.98) 100%)",
          border: "1px solid rgba(244,63,94,0.26)",
          color: "var(--ch-text)",
          boxShadow: "0 34px 110px rgba(15,23,42,0.18)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-400/16 text-rose-300">
              <UserCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300">
                Cadastro obrigatorio
              </p>
              <h2 className="mt-1 text-2xl font-bold leading-7" style={{ color: "var(--ch-text)" }}>Complete seu cadastro</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Confirme CPF/CNPJ e WhatsApp para liberar agentes, WhatsApp, creditos, checkout e recursos de atendimento.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AccountCompletionBadge label="Nome" ok={!status.missingFields.includes("full_name")} />
          <AccountCompletionBadge label="Documento" ok={!status.missingFields.includes("cpf")} />
          <AccountCompletionBadge label={accountType === "company" ? "Empresa" : "Tipo"} ok={accountType !== "company" || !status.missingFields.includes("company_name")} />
          <AccountCompletionBadge label="WhatsApp" ok={!status.missingFields.includes("phone_verification")} />
        </div>

        {step === "profile" ? (
          <form className="mt-5 grid gap-3" onSubmit={handleProfileSubmit}>
            <AccountCompletionTypeControl
              value={accountType}
              onChange={(nextType) => {
                setAccountType(nextType);
                setDocumentValue("");
                setError(null);
                setMessage(null);
              }}
            />
            <AccountCompletionInput
              label={accountType === "company" ? "Nome do responsavel" : "Nome completo"}
              onChange={setFullName}
              placeholder="Seu nome completo"
              value={fullName}
            />
            {accountType === "company" ? (
              <AccountCompletionInput
                label="Nome da empresa"
                onChange={setCompanyName}
                placeholder="Razao social ou nome fantasia"
                required
                value={companyName}
              />
            ) : null}
            <AccountCompletionInput
              inputMode="tel"
              label="WhatsApp"
              maxLength={19}
              onChange={(value) => {
                setPhone(formatBrazilPhoneInput(value));
                setMessage(null);
              }}
              placeholder="(47) 99999-9999"
              type="tel"
              value={phone}
            />
            <AccountCompletionWhatsappCheck check={whatsappCheck} />
            <AccountCompletionInput
              inputMode="numeric"
              label={documentLabel}
              maxLength={accountType === "company" ? 18 : 14}
              onChange={(value) => setDocumentValue(accountType === "company" ? formatCnpjInput(value) : formatCpfInput(value))}
              placeholder={status.cpfPreview ?? (accountType === "company" ? "00.000.000/0000-00" : "000.000.000-00")}
              required={status.missingFields.includes("cpf")}
              value={documentValue}
            />
            <AccountCompletionInput
              label="Criar senha"
              onChange={setPassword}
              placeholder="Opcional se voce ja usa senha"
              type="password"
              value={password}
            />
            <AccountCompletionFeedback error={error} message={message} />
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-400 px-4 font-mono text-[11px] font-black uppercase tracking-wide text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={working || !whatsappValidated}
              type="submit"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {whatsappCheck.state === "checking" ? "Verificando WhatsApp" : whatsappValidated ? "Salvar e enviar codigo" : "Aguardando WhatsApp valido"}
            </button>
          </form>
        ) : (
          <form className="mt-5 grid gap-3" onSubmit={handleCodeSubmit}>
            <AccountCompletionInput
              inputMode="numeric"
              label="Codigo recebido no WhatsApp"
              maxLength={6}
              onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              value={code}
            />
            <AccountCompletionFeedback error={error} message={message} />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-400 px-4 font-mono text-[11px] font-black uppercase tracking-wide text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={working}
                type="submit"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Validar WhatsApp
              </button>
              <button
                className="h-12 rounded-xl border border-cyan-300/30 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-700 transition hover:bg-cyan-300/10"
                onClick={() => setStep("profile")}
                type="button"
              >
                Editar numero
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function TrialWelcomeModal({
  status,
  milestoneCredits,
  onClose,
}: {
  status: BillingAccessClientStatus;
  milestoneCredits: number;
  onClose: () => void;
}) {
  const bonusCredits = Math.max(status.includedCredits, status.balanceCredits + status.usedCredits);
  const daysRemaining = status.trialDaysRemaining ?? 7;
  const tone = billingBannerTone("green");
  const isUsageReminder = milestoneCredits >= 100;
  const usedCredits = Math.max(status.usedCredits, milestoneCredits);
  const usagePercent = status.includedCredits > 0
    ? Math.round(Math.min(100, Math.max(0, (usedCredits / status.includedCredits) * 100)))
    : 0;
  const title = isUsageReminder
    ? `Voce ja usou ${formatShellCredits(usedCredits)} creditos`
    : "Bem-vindo ao seu teste gratis";
  const description = isUsageReminder
    ? `Ainda restam ${formatShellCredits(status.balanceCredits)} creditos do teste. Se voce assinar antes de acabar, esse saldo entra junto com os creditos do plano.`
    : `Voce recebeu ${formatShellCredits(bonusCredits)} creditos para testar a ConnectyHub por ${daysRemaining} dias. O saldo que sobrar pode acumular com o plano escolhido.`;

  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={isUsageReminder ? "Lembrete de creditos do teste" : "Bem-vindo ao teste gratis"}
      style={{ background: "rgba(15,23,42,0.34)" }}
    >
      <div
        className="w-full max-w-[620px] rounded-2xl p-5 shadow-2xl sm:p-6"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(244,249,253,0.98) 100%)",
          border: "1px solid rgba(52,211,153,0.34)",
          color: "var(--ch-text)",
          boxShadow: "0 34px 120px rgba(15,23,42,0.18)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{ background: tone.iconBackground, color: tone.color }}
            >
              <Coins className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: tone.color }}>
                {isUsageReminder ? "Bonus em uso" : "Bonus ativado"}
              </p>
              <h2 className="mt-1 text-2xl font-bold leading-8" style={{ color: "var(--ch-text)" }}>{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar boas-vindas"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-slate-500 transition hover:text-slate-900"
            onClick={onClose}
            style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <TrialWelcomeMetric
            label={isUsageReminder ? "creditos usados" : "bonus inicial"}
            value={formatShellCredits(isUsageReminder ? usedCredits : bonusCredits)}
          />
          <TrialWelcomeMetric label="saldo que acumula" value={formatShellCredits(status.balanceCredits)} />
          <TrialWelcomeMetric label="consumo" value={`${usagePercent}%`} />
          <TrialWelcomeMetric label="dias restantes" value={String(daysRemaining)} />
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-300/24 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-700">
          Voce ainda tem {formatShellCredits(status.balanceCredits)} creditos. Contratando durante o teste, esse saldo e preservado e soma aos creditos do plano escolhido.
        </div>

        <div className="mt-4 grid gap-2 text-[12px] leading-5 text-slate-600 sm:grid-cols-3">
          <TrialWelcomePoint>Teste atendimento, agentes e WhatsApp antes de assinar.</TrialWelcomePoint>
          <TrialWelcomePoint>Os creditos restantes do teste nao somem se voce assinar dentro dos 7 dias.</TrialWelcomePoint>
          <TrialWelcomePoint>Ao escolher Start, Pro ou Scale, os novos creditos entram junto com o saldo atual.</TrialWelcomePoint>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Link
            href="/dashboard/planos"
            className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-bold transition hover:opacity-90"
            onClick={onClose}
            style={{ background: tone.color, color: "#061015" }}
          >
            Ver planos e guardar saldo
          </Link>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-cyan-300/30 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-700 transition hover:bg-cyan-300/10"
            onClick={onClose}
          >
            Continuar testando
          </button>
        </div>
      </div>
    </div>
  );
}

function TrialWelcomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-[16px] font-bold text-emerald-700">{value}</p>
    </div>
  );
}

function TrialWelcomePoint({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border px-3 py-2.5" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </div>
  );
}

function AccountCompletionWhatsappCheck({ check }: { check: WhatsappCheckState }) {
  const isValid = check.state === "valid";
  const isChecking = check.state === "checking";
  const isNeutral = check.state === "idle" || check.state === "incomplete";
  const Icon = isValid ? CheckCircle2 : isChecking ? Loader2 : AlertTriangle;

  return (
    <div className={cn(
      "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5",
      isValid
        ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
        : isNeutral
          ? "border-cyan-300/20 bg-cyan-300/8 text-cyan-100"
          : "border-rose-300/30 bg-rose-300/10 text-rose-100",
    )}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isChecking && "animate-spin")} />
      <span>{check.message}</span>
    </div>
  );
}

function AccountCompletionBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{
      background: ok ? "rgba(5,150,105,0.10)" : "rgba(225,29,72,0.10)",
      borderColor: ok ? "rgba(5,150,105,0.24)" : "rgba(225,29,72,0.24)",
      color: ok ? "#047857" : "#be123c",
    }}>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-0.5 text-[11px] font-semibold">{ok ? "OK" : "Pendente"}</p>
    </div>
  );
}

function AccountCompletionTypeControl({
  onChange,
  value,
}: {
  onChange: (value: AccountCompletionAccountType) => void;
  value: AccountCompletionAccountType;
}) {
  const options: Array<{ icon: LucideIcon; label: string; value: AccountCompletionAccountType }> = [
    { icon: UserCheck, label: "Pessoa fisica", value: "person" },
    { icon: Building2, label: "Empresa", value: "company" },
  ];

  return (
    <div>
      <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        Tipo de cadastro
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-300 bg-slate-100 p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition",
                selected
                  ? "bg-cyan-300 text-slate-950"
                  : "text-slate-500 hover:bg-white hover:text-slate-900",
              )}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountCompletionInput({
  inputMode,
  label,
  maxLength,
  onChange,
  placeholder,
  required = true,
  type = "text",
  value,
}: {
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <input
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-cyan-300/50"
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required && label !== "Criar senha"}
        type={type}
        value={value}
      />
    </label>
  );
}

function getBrazilPhoneLocalDigitCount(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  return local.length;
}

function AccountCompletionFeedback({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) {
    return null;
  }

  return (
    <div className={cn(
      "rounded-xl border px-3 py-2 text-sm leading-6",
      error
        ? "border-rose-300/30 bg-rose-300/10 text-rose-700"
        : "border-emerald-300/25 bg-emerald-300/10 text-emerald-700",
    )}>
      {error ?? message}
    </div>
  );
}

function BillingAccessLockOverlay({ status }: { status: BillingAccessClientStatus | null }) {
  if (!status || status.canUseBillableFeatures) {
    return null;
  }

  const tone = billingBannerTone(status.bannerTone);
  const reason = lockReasonLabel(status.state);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={status.bannerTitle}
      style={{
        background: "rgba(15,23,42,0.34)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        className="w-full max-w-[520px] rounded-2xl border p-5 shadow-2xl sm:p-6"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(244,249,253,0.98) 100%)",
          borderColor: tone.border,
          color: "var(--ch-text)",
          boxShadow: "0 30px 120px rgba(15,23,42,0.18)",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
            style={{ background: tone.iconBackground, color: tone.color }}
          >
            <Coins className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: tone.color }}>
              {reason}
            </p>
            <h2 className="mt-1 text-[20px] font-bold leading-tight">{status.bannerTitle}</h2>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">{status.bannerDescription}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <LockMetric label="creditos" value={formatShellCredits(status.balanceCredits)} tone={tone.color} />
          <LockMetric label="usados" value={formatShellCredits(status.usedCredits)} tone={tone.color} />
          <LockMetric label="dias trial" value={status.trialDaysRemaining === null ? "--" : String(status.trialDaysRemaining)} tone={tone.color} />
        </div>

        <div className="mt-5 rounded-xl border px-4 py-3 text-[12px] leading-5 text-slate-500" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
          {lockSupportText(status)}
        </div>

        <div className="mt-5">
          <a
            href={status.ctaHref}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-[13px] font-bold transition hover:opacity-90"
            style={{ background: tone.color, color: "#061015" }}
          >
            {status.ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

function LockMetric({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-[16px] font-bold" style={{ color: tone }}>{value}</p>
    </div>
  );
}

function lockReasonLabel(state: BillingAccessClientStatus["state"]) {
  if (state === "trial_expired") return "teste de 7 dias encerrado";
  if (state === "trial_no_credits" || state === "paid_no_credits") return "creditos zerados";
  if (state === "paid_expired") return "plano vencido";
  return "acesso bloqueado";
}

function lockSupportText(status: BillingAccessClientStatus) {
  if (status.state === "trial_expired" && status.balanceCredits > 0) {
    return `Seus ${formatShellCredits(status.balanceCredits)} creditos ficaram guardados. Escolha um plano para somar esse saldo aos novos creditos e voltar a operar.`;
  }

  if (status.state === "paid_expired" && status.balanceCredits > 0) {
    return `Seus ${formatShellCredits(status.balanceCredits)} creditos continuam guardados, mas ficam congelados enquanto o plano estiver vencido.`;
  }

  if (status.state === "trial_no_credits" || status.state === "paid_no_credits") {
    return "Seus dados continuam salvos. Adicione creditos ou escolha um plano para liberar atendimentos, IA, voz, campanhas e automacoes.";
  }

  return "Seus dados continuam salvos. Para voltar a criar agentes, conectar WhatsApp, usar IA, voz, campanhas e automacoes, escolha um plano ativo.";
}

function BillingStatusBanner({ status }: { status: BillingAccessClientStatus | null }) {
  if (!status || status.state === "paid_active") {
    return null;
  }

  const tone = billingBannerTone(status.bannerTone);
  const progressLabel = billingProgressLabel(status);
  const progress = status.includedCredits > 0
    ? Math.max(0, Math.min(100, ((status.includedCredits - status.usedCredits) / status.includedCredits) * 100))
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1680px] px-3 pt-4 sm:px-4 sm:pt-5 lg:px-8 lg:pt-6">
      <div
        className="flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-2xl lg:flex-row lg:items-center lg:justify-between"
        style={{
          background: `linear-gradient(135deg, ${tone.background}, rgba(var(--ch-accent-2-rgb),0.08)), var(--ch-surface)`,
          borderColor: tone.border,
          boxShadow: "0 18px 44px rgba(15,23,42,0.08)",
        }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: tone.iconBackground, color: tone.color }}
            >
              <Coins className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                {status.bannerTitle}
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-400">
                {status.bannerDescription}
              </p>
            </div>
          </div>
          {status.includedCredits > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="h-2 overflow-hidden rounded-full bg-slate-900/10">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: tone.color }} />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                {progressLabel}
              </span>
            </div>
          ) : null}
        </div>

        <a
          href={status.ctaHref}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl px-4 font-mono text-[10px] font-bold uppercase tracking-wide transition hover:opacity-90"
          style={{ background: tone.color, color: "#061015" }}
        >
          {status.ctaLabel}
        </a>
      </div>
    </div>
  );
}

function billingProgressLabel(status: BillingAccessClientStatus) {
  if (status.state.startsWith("trial")) {
    return `${formatShellCredits(status.balanceCredits)} restam / ${formatShellCredits(status.usedCredits)} usados`;
  }

  return `${formatShellCredits(status.usedCredits)} usados / ${formatShellCredits(status.includedCredits)} do ciclo`;
}

function AdminImpersonationBanner() {
  const [returnSession, setReturnSession] = useState<AdminImpersonationReturn | null>(null);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReturnSession(readAdminImpersonationReturn());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (!returnSession) {
    return null;
  }

  const targetName = returnSession.targetName || returnSession.targetEmail || "este usuario";
  const adminName = returnSession.adminName || returnSession.adminEmail || "admin";

  async function handleReturnToAdmin() {
    if (!returnSession) {
      return;
    }

    setReturning(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: restoreError } = await supabase.auth.setSession({
        access_token: returnSession.accessToken,
        refresh_token: returnSession.refreshToken,
      });

      if (restoreError) {
        throw restoreError;
      }

      clearAdminImpersonationReturn();
      window.location.replace(returnSession.returnPath || "/admin/clientes");
    } catch {
      setError("Nao foi possivel restaurar sua sessao admin. Entre novamente pelo login.");
      setReturning(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-3 pt-4 sm:px-4 sm:pt-5 lg:px-8 lg:pt-6">
      <div
        className="flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-2xl sm:flex-row sm:items-center sm:justify-between"
        style={{
          background:
            "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.16), rgba(251,191,36,0.10)), var(--ch-surface)",
          borderColor: "rgba(251,191,36,0.42)",
          boxShadow: "0 18px 44px rgba(15,23,42,0.08)",
        }}
      >
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-700">
            Acesso administrativo ativo
          </div>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
            Voce esta acessando o painel de <span className="text-amber-700">{targetName}</span> como{" "}
            <span className="text-cyan-700">{adminName}</span>.
          </p>
          {error ? <p className="mt-1 text-[11px] text-rose-700">{error}</p> : null}
        </div>

        <button
          type="button"
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60"
          disabled={returning}
          onClick={handleReturnToAdmin}
          style={{
            background: "rgba(251,191,36,0.18)",
            borderColor: "rgba(251,191,36,0.42)",
            color: "#92400e",
          }}
        >
          {returning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
          Voltar ao Admin OS
        </button>
      </div>
    </div>
  );
}

// ─── SidebarLink ─────────────────────────────────────────────────────────────

function billingBannerTone(tone: BillingAccessClientStatus["bannerTone"]) {
  const tones = {
    green: {
      color: "#34d399",
      border: "rgba(52,211,153,0.34)",
      background: "rgba(52,211,153,0.14)",
      iconBackground: "rgba(52,211,153,0.16)",
    },
    amber: {
      color: "#fbbf24",
      border: "rgba(251,191,36,0.38)",
      background: "rgba(251,191,36,0.14)",
      iconBackground: "rgba(251,191,36,0.16)",
    },
    rose: {
      color: "#fb7185",
      border: "rgba(251,113,133,0.38)",
      background: "rgba(251,113,133,0.14)",
      iconBackground: "rgba(251,113,133,0.16)",
    },
    cyan: {
      color: "#38e8d6",
      border: "rgba(56,232,214,0.34)",
      background: "rgba(56,232,214,0.12)",
      iconBackground: "rgba(56,232,214,0.15)",
    },
  } satisfies Record<BillingAccessClientStatus["bannerTone"], {
    color: string;
    border: string;
    background: string;
    iconBackground: string;
  }>;

  return tones[tone];
}

function formatShellCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(Math.max(value, 0));
}

function notificationToneColor(tone: NotificationTone = "zinc") {
  const colors: Record<NotificationTone, string> = {
    green: "#34d399",
    cyan: "#38e8d6",
    amber: "#fbbf24",
    rose: "#fb7185",
    zinc: "#cbd5e1",
  };

  return colors[tone];
}

function notificationToneBackground(tone: NotificationTone = "zinc") {
  const backgrounds: Record<NotificationTone, string> = {
    green: "rgba(52,211,153,0.12)",
    cyan: "rgba(56,232,214,0.12)",
    amber: "rgba(251,191,36,0.12)",
    rose: "rgba(251,113,133,0.12)",
    zinc: "rgba(203,213,225,0.10)",
  };

  return backgrounds[tone];
}

function notificationToneBorder(tone: NotificationTone = "zinc") {
  const borders: Record<NotificationTone, string> = {
    green: "rgba(52,211,153,0.24)",
    cyan: "rgba(56,232,214,0.24)",
    amber: "rgba(251,191,36,0.30)",
    rose: "rgba(251,113,133,0.28)",
    zinc: "rgba(203,213,225,0.16)",
  };

  return borders[tone];
}

function dateTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function AccountAvatar({
  avatarUrl,
  logoTone,
  mode,
  name,
}: {
  avatarUrl: string | null;
  logoTone: "blue" | "white";
  mode: "admin" | "client";
  name: string;
}) {
  if (mode === "admin") {
    return <ConnectyLogo className="h-5 w-5" tone={logoTone} type="mark" />;
  }

  if (avatarUrl) {
    return (
      <span className="relative block h-full w-full">
        <Image alt={`Foto de ${name}`} className="object-cover" fill sizes="32px" src={avatarUrl} unoptimized />
      </span>
    );
  }

  return <>{name.slice(0, 2).toUpperCase()}</>;
}

function SidebarLink({
  item,
  isActive: active,
  onComingSoonClick,
}: {
  item: NavItem;
  isActive: boolean;
  onComingSoonClick: (item: NavItem) => void;
}) {
  const Icon = item.icon;
  const comingSoon = item.comingSoon || isMetaComingSoonClientHref(item.href);
  const badge = comingSoon ? item.badge ?? "Em breve" : item.badge;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (!comingSoon) {
          return;
        }

        event.preventDefault();
        onComingSoonClick(item);
      }}
      className="group relative flex h-9 items-center gap-2.5 rounded-xl px-3 text-[12.5px] transition-all"
      style={active ? {
        background: "linear-gradient(135deg, #e50914 0%, #b70710 100%)",
        border:     "1px solid rgba(229,9,20,0.68)",
        color:      "#ffffff",
        boxShadow:  "0 14px 28px rgba(229,9,20,0.22)",
      } : {
        background: "transparent",
        border:     "1px solid transparent",
        color:      "var(--ch-muted)",
      }}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
          style={{ background: "#ffffff", boxShadow: "0 0 10px rgba(255,255,255,0.65)" }}
        />
      ) : null}
      <Icon
        className={cn("h-4 w-4 shrink-0", active ? "" : "opacity-70 group-hover:opacity-100")}
        style={active ? undefined : { color: "var(--ch-muted)" }}
      />
      <span className="flex-1 truncate font-medium">{item.label}</span>
      {badge && (
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[9px] leading-none"
          style={
            item.badgeTone === "amber" ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" } :
            item.badgeTone === "rose"  ? { background: "rgba(251,113,133,0.15)", color: "#fb7185" } :
            active ? { background: "rgba(255,255,255,0.16)", color: "#ffffff" } :
                     { background: "var(--ch-hover)", color: "var(--ch-muted)" }
          }
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MobileAppMenu({
  active,
  activeItem,
  logoTone,
  mode,
  name,
  pageLabel,
  role,
  sections,
  onComingSoonClick,
  onClose,
}: {
  active: string;
  activeItem?: NavItem;
  logoTone: "blue" | "white";
  mode: "admin" | "client";
  name: string;
  pageLabel: string;
  role: string;
  sections: NavSection[];
  onComingSoonClick: (item: NavItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const quickItems = getMobileDockItems(sections, mode);
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return sections;
    }

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${section.label} ${item.label} ${item.href}`.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [normalizedQuery, sections]);

  return (
    <div
      id="connecty-mobile-menu"
      className="fixed inset-x-0 bottom-0 top-[60px] z-50 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 lg:hidden"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--ch-bg) 92%, var(--ch-surface-2) 8%), var(--ch-bg))",
      }}
    >
      <div className="mx-auto grid max-w-[430px] gap-3">
        <div
          className="rounded-3xl p-3"
          style={{
            background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.14), rgba(var(--ch-accent-2-rgb),0.06)), var(--ch-surface)",
            border: "1px solid var(--ch-border-strong)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: "rgba(var(--ch-accent-rgb),0.14)", border: "1px solid rgba(var(--ch-accent-rgb),0.28)" }}
              >
                <ConnectyLogo className="h-7 w-7" tone={logoTone} type="mark" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold leading-5" style={{ color: "var(--ch-text)" }}>{name}</p>
                <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: "var(--ch-muted)" }}>
                  {role} / {mode === "admin" ? "Admin OS" : "Client OS"}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar menu"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition"
              onClick={onClose}
              style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
            >
              <X className="h-4 w-4" style={{ color: "var(--ch-text)" }} />
            </button>
          </div>

          <div className="mt-3 rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid var(--ch-border)" }}>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: "var(--ch-subtle)" }}>Tela atual</p>
            <p className="mt-1 truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{pageLabel}</p>
            {activeItem ? (
              <Link
                href={activeItem.href}
                className="mt-2 inline-flex h-8 items-center gap-2 rounded-xl px-3 font-mono text-[9px] font-bold uppercase tracking-wide"
                onClick={(event) => {
                  if (activeItem.comingSoon || isMetaComingSoonClientHref(activeItem.href)) {
                    event.preventDefault();
                    onComingSoonClick(activeItem);
                    return;
                  }

                  onClose();
                }}
                style={{ background: "rgba(var(--ch-accent-rgb),0.16)", color: "var(--ch-accent)", border: "1px solid rgba(var(--ch-accent-rgb),0.28)" }}
              >
                {activeItem.comingSoon || isMetaComingSoonClientHref(activeItem.href) ? "Em breve" : "Abrir novamente"}
              </Link>
            ) : null}
          </div>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ch-muted)" }} />
          <input
            className="h-12 w-full rounded-2xl pl-11 pr-4 text-[16px] outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar no menu..."
            type="search"
            value={query}
            style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border-strong)", color: "var(--ch-text)" }}
          />
        </label>

        {!normalizedQuery ? (
          <div className="grid grid-cols-2 gap-2">
            {quickItems.map((item) => (
              <MobileMenuQuickLink
                key={item.href}
                active={isActive(item.href, active)}
                item={item}
                label={dockLabel(item, mode)}
                onComingSoonClick={onComingSoonClick}
                onClick={onClose}
              />
            ))}
          </div>
        ) : null}

        <nav className="grid gap-3" aria-label="Menu principal">
          {filteredSections.length > 0 ? filteredSections.map((section) => (
            <div key={section.label} className="rounded-3xl p-3" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: "var(--ch-subtle)" }}>{section.label}</p>
                <span className="font-mono text-[9px]" style={{ color: "var(--ch-muted)" }}>{section.items.length}</span>
              </div>
              <div className="grid gap-1.5">
                {section.items.map((item) => (
                  <MobileMenuLink
                    key={item.href}
                    item={item}
                    isActive={item.href === activeItem?.href}
                    onComingSoonClick={onComingSoonClick}
                    onClick={onClose}
                  />
                ))}
              </div>
            </div>
          )) : (
            <div className="rounded-3xl px-4 py-8 text-center text-[13px]" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}>
              Nenhum item encontrado.
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

function MobileMenuQuickLink({
  active,
  item,
  label,
  onComingSoonClick,
  onClick,
}: {
  active: boolean;
  item: NavItem;
  label: string;
  onComingSoonClick: (item: NavItem) => void;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const comingSoon = item.comingSoon || isMetaComingSoonClientHref(item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="grid min-h-[92px] gap-2 rounded-3xl p-3 transition"
      onClick={(event) => {
        if (comingSoon) {
          event.preventDefault();
          onComingSoonClick(item);
          return;
        }

        onClick();
      }}
      style={active ? {
        background: "linear-gradient(135deg, #e50914 0%, #b70710 100%)",
        border: "1px solid rgba(229,9,20,0.62)",
        color: "#ffffff",
        boxShadow: "0 16px 32px rgba(229,9,20,0.20)",
      } : {
        background: "linear-gradient(135deg, rgba(255,255,255,0.78), rgba(17,17,17,0.018)), var(--ch-surface)",
        border: "1px solid var(--ch-border)",
        color: "var(--ch-text)",
      }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-2xl"
        style={{ background: active ? "rgba(255,255,255,0.16)" : "rgba(17,17,17,0.05)", color: active ? "#ffffff" : "var(--ch-muted)" }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="self-end truncate text-[13px] font-semibold">{comingSoon ? "Em breve" : label}</span>
    </Link>
  );
}

function MobileMenuLink({
  item,
  isActive: active,
  onComingSoonClick,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onComingSoonClick: (item: NavItem) => void;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const comingSoon = item.comingSoon || isMetaComingSoonClientHref(item.href);
  const badge = comingSoon ? item.badge ?? "Em breve" : item.badge;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (comingSoon) {
          event.preventDefault();
          onComingSoonClick(item);
          return;
        }

        onClick();
      }}
      className="grid min-h-10 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] transition-all"
      style={active ? {
        background: "linear-gradient(135deg, #e50914 0%, #b70710 100%)",
        border:     "1px solid rgba(229,9,20,0.62)",
        color:      "#ffffff",
        boxShadow:  "0 12px 32px rgba(229,9,20,0.20)",
      } : {
        background: "linear-gradient(180deg, rgba(255,255,255,0.80), rgba(17,17,17,0.018)), var(--ch-surface-2)",
        border:     "1px solid var(--ch-border)",
        color:      "var(--ch-muted)",
      }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-xl"
        style={{
          background: active ? "rgba(255,255,255,0.16)" : "rgba(17,17,17,0.05)",
          color: active ? "#ffffff" : "var(--ch-muted)",
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 truncate font-semibold">{item.label}</span>
      {badge ? (
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[9px] leading-none"
          style={
            item.badgeTone === "amber" ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" } :
            item.badgeTone === "rose"  ? { background: "rgba(251,113,133,0.15)", color: "#fb7185" } :
            active ? { background: "rgba(255,255,255,0.16)", color: "#ffffff" } :
                     { background: "rgba(17,17,17,0.05)", color: "var(--ch-muted)" }
          }
        >
          {badge}
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "#ffffff" : "rgba(17,17,17,0.22)" }} />
      )}
    </Link>
  );
}

function MobileDock({
  active,
  items,
  mode,
  onComingSoonClick,
  onMenuClick,
}: {
  active: string;
  items: NavItem[];
  mode: "admin" | "client";
  onComingSoonClick: (item: NavItem) => void;
  onMenuClick: () => void;
}) {
  return (
    <nav className="connecty-mobile-dock fixed inset-x-0 bottom-0 z-40 lg:hidden" aria-label="Navegacao principal">
      <div
        className="mx-3 mb-2 grid grid-cols-5 gap-1 rounded-2xl p-1.5 shadow-2xl"
        style={{
          background: "rgba(255,255,255,0.88)",
          border: "1px solid var(--ch-border-strong)",
          boxShadow: "0 -18px 50px rgba(15,23,42,0.12)",
          backdropFilter: "blur(18px)",
        }}
      >
        {items.map((item) => (
          <MobileDockLink
            key={item.href}
            active={isActive(item.href, active)}
            item={item}
            label={dockLabel(item, mode)}
            onComingSoonClick={onComingSoonClick}
          />
        ))}
        <button
          type="button"
          className="grid min-h-[56px] min-w-0 place-items-center gap-0.5 rounded-xl px-1.5 text-center transition"
          onClick={onMenuClick}
          style={{
            background: "var(--ch-surface-2)",
            border: "1px solid var(--ch-border)",
            color: "var(--ch-muted)",
          }}
        >
          <Menu className="h-4 w-4" />
          <span className="max-w-full truncate font-mono text-[9px] font-semibold uppercase tracking-wide">Menu</span>
        </button>
      </div>
    </nav>
  );
}

function MobileDockLink({
  active,
  item,
  label,
  onComingSoonClick,
}: {
  active: boolean;
  item: NavItem;
  label: string;
  onComingSoonClick: (item: NavItem) => void;
}) {
  const Icon = item.icon;
  const comingSoon = item.comingSoon || isMetaComingSoonClientHref(item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (!comingSoon) {
          return;
        }

        event.preventDefault();
        onComingSoonClick(item);
      }}
      className="grid min-h-[56px] min-w-0 place-items-center gap-0.5 rounded-xl px-1.5 text-center transition"
      style={active ? {
        background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.96), rgba(var(--ch-accent-2-rgb),0.86))",
        border: "1px solid rgba(255,255,255,0.24)",
        color: "#061015",
        boxShadow: "0 10px 28px rgba(var(--ch-accent-rgb),0.20)",
      } : {
        background: "transparent",
        border: "1px solid transparent",
        color: "var(--ch-muted)",
      }}
    >
      <Icon className="h-4 w-4" />
      <span className="max-w-full truncate font-mono text-[9px] font-semibold uppercase tracking-wide">{comingSoon ? "Breve" : label}</span>
    </Link>
  );
}

function getMobileDockItems(sections: NavSection[], mode: "admin" | "client") {
  const dockHrefs = mode === "admin"
    ? ["/admin", "/admin/whatsapp/atendimento", "/admin/clientes", "/admin/leads"]
    : ["/dashboard", "/dashboard/atendimento", "/dashboard/links", "/dashboard/minha-conta"];
  const items = sections.flatMap((section) => section.items);

  return dockHrefs
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
}

function dockLabel(item: NavItem, mode: "admin" | "client") {
  if (item.href === "/admin" || item.href === "/dashboard") {
    return "Inicio";
  }

  if (mode === "admin") {
    if (item.href === "/admin/whatsapp/atendimento") return "WhatsApp";
    if (item.href === "/admin/clientes") return "Clientes";
    if (item.href === "/admin/leads") return "Leads";
  }

  if (item.href === "/dashboard/atendimento") return "Atender";
  if (item.href === "/dashboard/whatsapp") return "Agentes";
  if (item.href === "/dashboard/links") return "Vendas";
  if (item.href === "/dashboard/minha-conta") return "Conta";

  return item.label;
}

function isActive(href: string, current: string) {
  if (href === current) return true;
  if (href !== "/admin" && href !== "/dashboard" && current.startsWith(`${href}/`)) return true;
  return false;
}

function resolveActiveItem(sections: NavSection[], active: string) {
  return sections
    .flatMap((s) => s.items)
    .filter((item) => isActive(item.href, active))
    .sort((left, right) => right.href.length - left.href.length)[0];
}
