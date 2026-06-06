"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Coins,
  FileCode2,
  GitBranch,
  Globe2,
  Link2,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PlugZap,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wand2,
  Workflow,
  Wrench,
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
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  badgeTone?: "green" | "amber" | "rose";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

// ─── Navigation ───────────────────────────────────────────────────────────────

const adminSections: NavSection[] = [
  {
    label: "Operação",
    items: [
      { label: "Dashboard",   href: "/admin",              icon: BarChart3 },
      { label: "Clientes",    href: "/admin/clientes",     icon: Users,        badge: "142" },
      { label: "Planos",      href: "/admin/planos",       icon: Coins },
      { label: "Agentes",     href: "/admin/agentes",      icon: Bot },
      { label: "Setores",     href: "/admin/setores",      icon: GitBranch },
      { label: "CEO IA",      href: "/admin/ceo",          icon: Wand2 },
      { label: "Aprovações",  href: "/admin/aprovacoes",   icon: ShieldCheck,  badge: "17", badgeTone: "amber" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Manutenção",    href: "/admin/maintenance",  icon: Wrench,           badge: "!", badgeTone: "rose" },
      { label: "Auditoria",     href: "/admin/auditoria",    icon: FileCode2 },
      { label: "Financeiro",    href: "/admin/financeiro",   icon: CircleDollarSign },
      { label: "Configurações", href: "/admin/configuracoes",icon: SlidersHorizontal },
    ],
  },
];

const clientSections: NavSection[] = [
  {
    label: "Vendas",
    items: [
      { label: "Dashboard",    href: "/dashboard",                icon: BarChart3 },
      { label: "Minha Empresa",href: "/dashboard/empresa",        icon: Building2 },
      { label: "Leads",        href: "/dashboard/leads",          icon: UserCheck },
      { label: "Conversas",    href: "/dashboard/conversas",      icon: MessageSquare },
      { label: "WhatsApp",     href: "/dashboard/whatsapp",       icon: MessageCircle },
      { label: "Instagram",    href: "/dashboard/instagram",      icon: Sparkles },
      { label: "Agentes",      href: "/dashboard/agentes",        icon: Bot },
      { label: "CRM / Funil",  href: "/dashboard/crm",            icon: Workflow },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { label: "Links",           href: "/dashboard/links",            icon: Link2 },
      { label: "Campanhas",       href: "/dashboard/campanhas",        icon: Megaphone },
      { label: "Tráfego Pago",    href: "/dashboard/trafego-pago",     icon: TrendingUp },
      { label: "Orgânico",        href: "/dashboard/trafego-organico", icon: Globe2 },
      { label: "Automações",      href: "/dashboard/automacoes",       icon: Zap },
      { label: "Produtos",        href: "/dashboard/produtos",         icon: ShoppingBag },
      { label: "Relatórios",      href: "/dashboard/relatorios",       icon: BarChart3 },
      { label: "Integrações",     href: "/dashboard/integracoes",      icon: PlugZap },
      { label: "Configurações",   href: "/dashboard/configuracoes",    icon: Settings },
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
}: {
  mode: "admin" | "client";
  children: ReactNode;
  isPlatformAdmin?: boolean;
  workspaceName?: string;
  userLabel?: string;
  activeHref?: string;
}) {
  const pathname  = usePathname();
  const active    = activeHref ?? pathname ?? "/";
  const sections  = mode === "admin" ? adminSections : clientSections;
  const accent: "blue" | "cyan" = mode === "admin" ? "blue" : "cyan";
  const name      = mode === "admin" ? "ConnectyHub" : (workspaceName ?? "Minha empresa");
  const role      = mode === "admin" ? "Platform Admin" : (userLabel ?? "workspace");
  const switchTo  = mode === "admin" ? "/dashboard" : "/admin";
  const switchLbl = mode === "admin" ? "Client OS" : "Admin OS";
  const canSwitch = mode === "admin" || isPlatformAdmin;
  const pageLabel = resolveLabel(sections, active, mode);

  return (
    <div
      className="flex min-h-svh"
      style={{
        background:  "var(--ch-bg)",
        colorScheme: "light",
        "--ch-bg":         "#f1f5f9",
        "--ch-surface":    "#ffffff",
        "--ch-surface-2":  "#f8fafc",
        "--ch-border":     "rgba(15,23,42,0.09)",
        "--ch-brand-blue": "#01004c",
        "--ch-accent":     mode === "admin" ? "#01004c" : "#06b6d4",
        "--ch-accent-rgb": mode === "admin" ? "1,0,76" : "6,182,212",
        "--ch-text":       "#0f172a",
        "--ch-text-rgb":   "15,23,42",
        "--ch-muted":      "#64748b",
        "--ch-hover":      "rgba(15,23,42,0.05)",
        "--ch-dropdown-bg":"#ffffff",
      } as CSSProperties}
    >
      {/* ── Sidebar ── */}
      <aside
        className="sticky top-0 hidden h-svh w-[240px] shrink-0 flex-col lg:flex"
        style={{
          background:  "var(--ch-surface)",
          borderRight: "1px solid var(--ch-border)",
        }}
      >
        {/* Brand */}
        <div
          className="flex h-[60px] items-center gap-3 px-5"
          style={{ borderBottom: "1px solid var(--ch-border)" }}
        >
          <Link href="/" className="min-w-0 flex-1">
            <ConnectyLogo className="h-[22px] w-[170px]" tone="blue" type="full" />
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
                style={{ color: "var(--ch-muted)" }}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarLink key={item.href} item={item} isActive={isActive(item.href, active)} accent={accent} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Identity */}
        <div className="p-3" style={{ borderTop: "1px solid var(--ch-border)" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition outline-none"
                style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--ch-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                  style={{ background: `rgba(var(--ch-accent-rgb),0.15)`, color: "var(--ch-accent)" }}
                >
                  {mode === "admin" ? (
                    <ConnectyLogo className="h-6 w-6" tone="blue" type="mark" />
                  ) : (
                    name.slice(0, 2).toUpperCase()
                  )}
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
              className="w-52"
              style={{ background: "var(--ch-dropdown-bg)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
            >
              <DropdownMenuLabel className="text-xs" style={{ color: "var(--ch-muted)" }}>Conta</DropdownMenuLabel>
              <DropdownMenuSeparator style={{ background: "var(--ch-border)" }} />
              {canSwitch && (
                <DropdownMenuItem asChild className="cursor-pointer text-xs" style={{ color: "var(--ch-text)" }}>
                  <Link href={switchTo}>{switchLbl}</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="cursor-pointer text-xs text-rose-500">
                <a href="/auth/signout">
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
          className="sticky top-0 z-40 flex h-[60px] items-center gap-3 px-6"
          style={{
            background:    "color-mix(in srgb, var(--ch-surface) 92%, transparent)",
            backdropFilter:"blur(16px)",
            borderBottom:  "1px solid var(--ch-border)",
          }}
        >
          {/* Mobile brand */}
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: `rgba(var(--ch-accent-rgb),0.15)` }}>
              <ConnectyLogo className="h-5 w-5" tone="blue" type="mark" />
            </div>
          </Link>

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
                  background: "var(--ch-surface-2)",
                  border:     "1px solid var(--ch-border)",
                }}
              />
            </div>

            {/* Notifications */}
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg transition"
              onMouseEnter={e => (e.currentTarget.style.background = "var(--ch-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              style={{ border: "1px solid var(--ch-border)" }}
            >
              <Bell className="h-4 w-4 text-slate-400" />
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--ch-accent)", boxShadow: `0 0 6px var(--ch-accent)` }}
              />
            </button>

            {/* Mode switch */}
            {canSwitch && (
              <Link
                href={switchTo}
                className="hidden h-8 items-center rounded-lg px-3 font-mono text-[10px] uppercase tracking-wide transition md:flex"
                style={{ border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
              >
                {switchLbl}
              </Link>
            )}

            {/* Mode badge */}
            <span
              className="hidden h-7 items-center rounded-lg px-3 font-mono text-[10px] uppercase tracking-wider md:flex"
              style={{
                background: `rgba(var(--ch-accent-rgb),0.12)`,
                border:     `1px solid rgba(var(--ch-accent-rgb),0.25)`,
                color:      "var(--ch-accent)",
              }}
            >
              {mode === "admin" ? "Admin OS" : "Client OS"}
            </span>

            {/* Avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold outline-none"
                style={{
                  background: `rgba(var(--ch-accent-rgb),0.15)`,
                  color:      "var(--ch-accent)",
                }}
              >
                {mode === "admin" ? (
                  <ConnectyLogo className="h-5 w-5" tone="blue" type="mark" />
                ) : (
                  name.slice(0, 2).toUpperCase()
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52"
                style={{ background: "var(--ch-dropdown-bg)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              >
                <DropdownMenuLabel className="text-xs">
                  <div style={{ color: "var(--ch-text)" }}>{name}</div>
                  <div className="font-normal text-slate-500">{role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator style={{ background: "var(--ch-border)" }} />
                {canSwitch && (
                  <DropdownMenuItem asChild className="text-xs hover:bg-white/8 cursor-pointer">
                    <Link href={switchTo}>{switchLbl}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild className="text-xs text-rose-400 hover:bg-white/8 cursor-pointer">
                  <a href="/auth/signout"><LogOut className="mr-2 h-3.5 w-3.5" />Sair</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile nav */}
        <div
          className="flex gap-1.5 overflow-x-auto px-4 py-2.5 lg:hidden"
          style={{ background: "var(--ch-surface)", borderBottom: "1px solid var(--ch-border)" }}
        >
          {sections.flatMap((s) => s.items).map((item) => {
            const Icon  = item.icon;
            const activ = isActive(item.href, active);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-3 font-mono text-[10px] whitespace-nowrap transition"
                style={activ ? {
                  background: `rgba(var(--ch-accent-rgb),0.15)`,
                  border:     `1px solid rgba(var(--ch-accent-rgb),0.25)`,
                  color:      "var(--ch-accent)",
                } : {
                  background: "transparent",
                  border:     "1px solid var(--ch-border)",
                  color:      "var(--ch-muted)",
                }}
              >
                <Icon className="h-3 w-3" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1680px] px-6 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── SidebarLink ─────────────────────────────────────────────────────────────

function SidebarLink({
  item,
  isActive: active,
  accent,
}: {
  item: NavItem;
  isActive: boolean;
  accent: "blue" | "cyan";
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group flex h-9 items-center gap-2.5 rounded-xl px-3 text-[12.5px] transition-all"
      style={active ? {
        background: `rgba(var(--ch-accent-rgb),0.12)`,
        border:     `1px solid rgba(var(--ch-accent-rgb),0.2)`,
        color:      "var(--ch-accent)",
      } : {
        background: "transparent",
        border:     "1px solid transparent",
        color:      "var(--ch-muted)",
      }}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "" : "opacity-60 group-hover:opacity-100")} />
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

function isActive(href: string, current: string) {
  if (href === current) return true;
  if (href !== "/admin" && href !== "/dashboard" && current.startsWith(href)) return true;
  return false;
}

function resolveLabel(sections: NavSection[], active: string, mode: string) {
  const item = sections.flatMap((s) => s.items).find((i) => isActive(i.href, active));
  return item?.label ?? (mode === "admin" ? "Dashboard" : "Dashboard");
}
