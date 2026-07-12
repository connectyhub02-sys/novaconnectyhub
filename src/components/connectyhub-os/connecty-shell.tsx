"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  Building2,
  Camera,
  ChevronDown,
  CircleDollarSign,
  Coins,
  FileCode2,
  GitBranch,
  Globe2,
  LogOut,
  Loader2,
  Menu,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PlugZap,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wand2,
  Workflow,
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
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type AccentTone = "teal" | "emerald" | "sky" | "blue" | "violet" | "amber" | "rose" | "fuchsia" | "slate";

type NotificationTone = "green" | "cyan" | "amber" | "rose" | "zinc";

export type ConnectyShellNotification = {
  id: string;
  title: string;
  description: string;
  meta?: string | null;
  occurredAt?: string | null;
  tone?: NotificationTone;
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
      { label: "Conteudo",    href: "/admin/conteudo",     icon: Globe2, tone: "sky" },
      { label: "Trafego",     href: "/admin/trafego",      icon: Megaphone, tone: "sky" },
      { label: "Setores",     href: "/admin/setores",      icon: GitBranch, tone: "teal" },
      { label: "CEO IA",      href: "/admin/ceo",          icon: Wand2, tone: "fuchsia" },
      { label: "Aprovações",  href: "/admin/aprovacoes",   icon: ShieldCheck, tone: "amber", badge: "17", badgeTone: "amber" },
    ],
  },
  {
    label: "Clientes",
    items: [
      { label: "Clientes",          href: "/admin/clientes",          icon: Users, tone: "sky", badge: "142" },
      { label: "CRM Leads",         href: "/admin/leads",             icon: UserCheck, tone: "emerald" },
      { label: "Planos",            href: "/admin/planos",            icon: Coins, tone: "amber" },
      { label: "Produtos CH",       href: "/admin/produtos-connectyhub", icon: ShoppingBag, tone: "amber" },
      { label: "WhatsApp Clientes", href: "/admin/clientes/whatsapp", icon: MessageCircle, tone: "teal" },
      { label: "API WhatsApp",      href: "/admin/api-whatsapp",      icon: PlugZap, tone: "emerald" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Manutenção",    href: "/admin/maintenance",  icon: Wrench, tone: "rose", badge: "!", badgeTone: "rose" },
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
      { label: "Leads",        href: "/dashboard/leads",          icon: UserCheck, tone: "emerald" },
      { label: "Conversas",    href: "/dashboard/conversas",      icon: MessageSquare, tone: "teal" },
      { label: "Agentes",      href: "/dashboard/whatsapp",       icon: Bot, tone: "violet" },
      { label: "CRM / Funil",  href: "/dashboard/crm",            icon: Workflow, tone: "amber" },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { label: "Catálogo de Vendas", href: "/dashboard/links",         icon: ShoppingBag, tone: "sky" },
      { label: "Campanhas",       href: "/dashboard/campanhas",        icon: Megaphone, tone: "fuchsia" },
      { label: "Orgânico",        href: "/dashboard/trafego-organico", icon: Globe2, tone: "emerald" },
      { label: "Automações",      href: "/dashboard/automacoes",       icon: Zap, tone: "violet" },
      { label: "Produtos",        href: "/dashboard/produtos",         icon: ShoppingBag, tone: "amber" },
      { label: "Relatórios",      href: "/dashboard/relatorios",       icon: BarChart3, tone: "blue" },
      { label: "Integrações",     href: "/dashboard/integracoes",      icon: PlugZap, tone: "teal" },
      { label: "API WhatsApp",     href: "/dashboard/api-whatsapp",     icon: PlugZap, tone: "emerald" },
      { label: "Configurações",   href: "/dashboard/configuracoes",    icon: Settings, tone: "slate" },
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
  const activeTone = activeItem?.tone ?? (mode === "admin" ? "teal" : "blue");
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
  const logoTone  = "white";
  const [avatarUrl, setAvatarUrl] = useState(userAvatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationGroups, setNotificationGroups] = useState<Record<string, ConnectyShellNotification[]>>({});

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
    background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.10) 0%, transparent 30rem), linear-gradient(225deg, rgba(var(--ch-accent-2-rgb),0.08) 0%, transparent 34rem), linear-gradient(180deg, var(--ch-bg), #04060a 72%)",
    colorScheme: "dark",
    "--ch-bg":         "#05080d",
    "--ch-surface":    "#0c1422",
    "--ch-surface-2":  "#122035",
    "--ch-surface-3":  "#1d304c",
    "--ch-border":     "rgba(189,209,235,0.28)",
    "--ch-border-soft":"rgba(189,209,235,0.16)",
    "--ch-border-strong":"rgba(220,233,249,0.42)",
    "--ch-brand-blue": "#01004c",
    "--ch-accent":     accent,
    "--ch-accent-rgb": accentRgb,
    "--ch-accent-2":   accent2,
    "--ch-accent-2-rgb": accent2Rgb,
    "--ch-panel":      "linear-gradient(180deg, rgba(var(--ch-accent-rgb),0.075), rgba(var(--ch-accent-2-rgb),0.030)), var(--ch-surface)",
    "--ch-panel-2":    "linear-gradient(180deg, rgba(255,255,255,0.060), rgba(var(--ch-accent-rgb),0.026)), var(--ch-surface-2)",
    "--ch-text":       "#fbfdff",
    "--ch-text-rgb":   "251,253,255",
    "--ch-muted":      "#c5d0df",
    "--ch-subtle":     "#94a6bb",
    "--ch-hover":      "rgba(var(--ch-accent-rgb),0.15)",
    "--ch-dropdown-bg":"#101a2a",
    "--background":    "#05080d",
    "--foreground":    "#fbfdff",
    "--card":          "#0c1422",
    "--card-foreground":"#fbfdff",
    "--popover":       "#121a27",
    "--popover-foreground":"#fbfdff",
    "--primary":       accent,
    "--primary-foreground":"#061015",
    "--secondary":     "#122035",
    "--secondary-foreground":"#fbfdff",
    "--muted":         "#122035",
    "--muted-foreground":"#c5d0df",
    "--accent":        "#1d304c",
    "--accent-foreground":"#fbfdff",
    "--border":        "rgba(196,211,232,0.24)",
    "--input":         "rgba(224,233,246,0.30)",
    "--ring":          `rgba(${accentRgb},0.48)`,
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
          background:  "linear-gradient(180deg, rgba(8,11,16,0.99), rgba(6,8,12,0.99))",
          borderRight: "1px solid var(--ch-border-strong)",
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
                  <SidebarLink key={item.href} item={item} isActive={item.href === activeItem?.href} />
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
                background: "linear-gradient(180deg, #111b2a 0%, #07111d 100%)",
                border: "1px solid rgba(224,233,246,0.46)",
                boxShadow: "0 28px 90px rgba(0,0,0,0.72)",
                color: "#fbfdff",
                maxWidth: "340px",
                minWidth: "280px",
                width: "calc(100vw - 40px)",
              }}
            >
              <DropdownMenuLabel
                className="rounded-xl px-3 py-3 text-xs"
                style={{ background: "rgba(255,255,255,0.055)", color: "#e7eef8" }}
              >
                Conta
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2" style={{ background: "rgba(224,233,246,0.18)" }} />
              {mode === "client" && (
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                  <label
                    className="flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                    style={{ background: "rgba(255,255,255,0.075)", color: "#fbfdff", border: "1px solid rgba(224,233,246,0.12)" }}
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
                    style={{ background: "rgba(255,255,255,0.075)", color: "#fbfdff", border: "1px solid rgba(224,233,246,0.12)" }}
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
                  style={{ background: "rgba(251,113,133,0.18)", border: "1px solid rgba(251,113,133,0.34)", color: "#ffe4e6" }}
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
            background:    "color-mix(in srgb, var(--ch-bg) 76%, var(--ch-surface) 24%)",
            backdropFilter:"blur(16px)",
            borderBottom:  "1px solid var(--ch-border-strong)",
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
                    background: "linear-gradient(180deg, #111b2a 0%, #07111d 100%)",
                    border: "1px solid rgba(224,233,246,0.46)",
                    boxShadow: "0 28px 90px rgba(0,0,0,0.72)",
                    color: "#fbfdff",
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
                      style={{ background: "rgba(255,255,255,0.075)", border: "1px solid rgba(224,233,246,0.14)" }}
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
                            background: "rgba(255,255,255,0.055)",
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
                    <div className="rounded-xl px-3 py-4 text-[12px] leading-5 text-slate-500" style={{ background: "rgba(255,255,255,0.045)" }}>
                      Nenhuma notificacao ativa.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

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
                  background: "linear-gradient(180deg, #111b2a 0%, #07111d 100%)",
                  border: "1px solid rgba(224,233,246,0.46)",
                  boxShadow: "0 28px 90px rgba(0,0,0,0.72)",
                  color: "#fbfdff",
                  maxWidth: "340px",
                  minWidth: "280px",
                  width: "calc(100vw - 40px)",
                }}
              >
                <DropdownMenuLabel
                  className="rounded-xl px-3 py-3 text-xs"
                  style={{ background: "rgba(255,255,255,0.055)" }}
                >
                  <div className="truncate text-[14px] font-bold leading-5" style={{ color: "#fbfdff" }}>{name}</div>
                  <div className="truncate font-mono text-[10px] font-normal uppercase tracking-wide" style={{ color: "#cbd5e1" }}>{role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-2" style={{ background: "rgba(224,233,246,0.18)" }} />
                {mode === "client" && (
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 text-[13px]">
                    <label
                      className="flex h-11 w-full items-center rounded-xl px-3 font-semibold"
                      style={{ background: "rgba(255,255,255,0.075)", color: "#fbfdff", border: "1px solid rgba(224,233,246,0.12)" }}
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
                      style={{ background: "rgba(255,255,255,0.075)", color: "#fbfdff", border: "1px solid rgba(224,233,246,0.12)" }}
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
                    style={{ background: "rgba(251,113,133,0.18)", border: "1px solid rgba(251,113,133,0.34)", color: "#ffe4e6" }}
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
            onClose={() => setMobileMenuOpen(false)}
          />
        ) : null}

        {!mobileMenuOpen ? (
          <MobileDock
            active={active}
            items={mobileDockItems}
            mode={mode}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
        ) : null}

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {mode === "client" ? <AdminImpersonationBanner /> : null}
          <div className="connecty-shell-content mx-auto w-full max-w-[1680px] px-3 pt-4 sm:px-4 sm:pt-5 lg:px-8 lg:py-6">
            {children}
          </div>
        </main>
      </div>
      </div>
    </ConnectyShellNotificationsContext.Provider>
  );
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
          boxShadow: "0 18px 44px rgba(0,0,0,0.26)",
        }}
      >
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-200">
            Acesso administrativo ativo
          </div>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
            Voce esta acessando o painel de <span className="text-amber-200">{targetName}</span> como{" "}
            <span className="text-cyan-200">{adminName}</span>.
          </p>
          {error ? <p className="mt-1 text-[11px] text-rose-200">{error}</p> : null}
        </div>

        <button
          type="button"
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60"
          disabled={returning}
          onClick={handleReturnToAdmin}
          style={{
            background: "rgba(251,191,36,0.18)",
            borderColor: "rgba(251,191,36,0.42)",
            color: "#fde68a",
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
  logoTone: "white";
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
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;
  const itemPalette = accentPalettes[item.tone ?? "slate"];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group relative flex h-9 items-center gap-2.5 rounded-xl px-3 text-[12.5px] transition-all"
      style={active ? {
        background: "linear-gradient(90deg, rgba(var(--ch-accent-rgb),0.22), rgba(var(--ch-accent-2-rgb),0.10))",
        border:     `1px solid rgba(var(--ch-accent-rgb),0.48)`,
        color:      "var(--ch-text)",
        boxShadow:  "0 10px 28px rgba(var(--ch-accent-rgb),0.14)",
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
          style={{ background: "var(--ch-accent)", boxShadow: "0 0 10px rgba(var(--ch-accent-rgb),0.75)" }}
        />
      ) : null}
      <Icon
        className={cn("h-4 w-4 shrink-0", active ? "" : "opacity-70 group-hover:opacity-100")}
        style={active ? undefined : { color: itemPalette.accent }}
      />
      <span className="flex-1 truncate font-medium">{item.label}</span>
      {item.badge && (
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[9px] leading-none"
          style={
            item.badgeTone === "amber" ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" } :
            item.badgeTone === "rose"  ? { background: "rgba(251,113,133,0.15)", color: "#fb7185" } :
            active ? { background: `rgba(var(--ch-accent-rgb),0.15)`, color: "var(--ch-accent)" } :
                     { background: "var(--ch-hover)", color: "var(--ch-muted)" }
          }
        >
          {item.badge}
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
  onClose,
}: {
  active: string;
  activeItem?: NavItem;
  logoTone: "white";
  mode: "admin" | "client";
  name: string;
  pageLabel: string;
  role: string;
  sections: NavSection[];
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
                onClick={onClose}
                style={{ background: "rgba(var(--ch-accent-rgb),0.16)", color: "var(--ch-accent)", border: "1px solid rgba(var(--ch-accent-rgb),0.28)" }}
              >
                Abrir novamente
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
  onClick,
}: {
  active: boolean;
  item: NavItem;
  label: string;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const itemPalette = accentPalettes[item.tone ?? "slate"];

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="grid min-h-[92px] gap-2 rounded-3xl p-3 transition"
      onClick={onClick}
      style={active ? {
        background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.26), rgba(var(--ch-accent-2-rgb),0.12))",
        border: "1px solid rgba(var(--ch-accent-rgb),0.48)",
        color: "var(--ch-text)",
      } : {
        background: "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.020)), var(--ch-surface)",
        border: `1px solid rgba(${itemPalette.accentRgb},0.26)`,
        color: "var(--ch-text)",
      }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-2xl"
        style={{ background: active ? "rgba(var(--ch-accent-rgb),0.16)" : `rgba(${itemPalette.accentRgb},0.14)`, color: active ? "var(--ch-accent)" : itemPalette.accent }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="self-end truncate text-[13px] font-semibold">{label}</span>
    </Link>
  );
}

function MobileMenuLink({
  item,
  isActive: active,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const itemPalette = accentPalettes[item.tone ?? "slate"];

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className="grid min-h-10 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] transition-all"
      style={active ? {
        background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.26), rgba(var(--ch-accent-2-rgb),0.12))",
        border:     `1px solid rgba(var(--ch-accent-rgb),0.54)`,
        color:      "var(--ch-text)",
        boxShadow:  "0 12px 32px rgba(var(--ch-accent-rgb),0.15)",
      } : {
        background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--ch-surface-2)",
        border:     `1px solid rgba(${itemPalette.accentRgb},0.22)`,
        color:      "var(--ch-muted)",
      }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-xl"
        style={{
          background: active ? `rgba(var(--ch-accent-rgb),0.18)` : `rgba(${itemPalette.accentRgb},0.12)`,
          color: active ? "var(--ch-accent)" : itemPalette.accent,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 truncate font-semibold">{item.label}</span>
      {item.badge ? (
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[9px] leading-none"
          style={
            item.badgeTone === "amber" ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" } :
            item.badgeTone === "rose"  ? { background: "rgba(251,113,133,0.15)", color: "#fb7185" } :
            active ? { background: `rgba(var(--ch-accent-rgb),0.15)`, color: "var(--ch-accent)" } :
                     { background: `rgba(${itemPalette.accentRgb},0.13)`, color: itemPalette.accent }
          }
        >
          {item.badge}
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "var(--ch-accent)" : `rgba(${itemPalette.accentRgb},0.55)` }} />
      )}
    </Link>
  );
}

function MobileDock({
  active,
  items,
  mode,
  onMenuClick,
}: {
  active: string;
  items: NavItem[];
  mode: "admin" | "client";
  onMenuClick: () => void;
}) {
  return (
    <nav className="connecty-mobile-dock fixed inset-x-0 bottom-0 z-40 lg:hidden" aria-label="Navegacao principal">
      <div
        className="mx-3 mb-2 grid grid-cols-5 gap-1 rounded-2xl p-1.5 shadow-2xl"
        style={{
          background: "color-mix(in srgb, var(--ch-bg) 82%, var(--ch-surface-2) 18%)",
          border: "1px solid var(--ch-border-strong)",
          boxShadow: "0 -18px 50px rgba(0,0,0,0.38)",
        }}
      >
        {items.map((item) => (
          <MobileDockLink key={item.href} active={isActive(item.href, active)} item={item} label={dockLabel(item, mode)} />
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

function MobileDockLink({ active, item, label }: { active: boolean; item: NavItem; label: string }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
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
      <span className="max-w-full truncate font-mono text-[9px] font-semibold uppercase tracking-wide">{label}</span>
    </Link>
  );
}

function getMobileDockItems(sections: NavSection[], mode: "admin" | "client") {
  const dockHrefs = mode === "admin"
    ? ["/admin", "/admin/whatsapp/atendimento", "/admin/clientes", "/admin/leads"]
    : ["/dashboard", "/dashboard/conversas", "/dashboard/whatsapp", "/dashboard/links"];
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

  if (item.href === "/dashboard/conversas") return "Conversas";
  if (item.href === "/dashboard/whatsapp") return "Agentes";
  if (item.href === "/dashboard/links") return "Vendas";

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
