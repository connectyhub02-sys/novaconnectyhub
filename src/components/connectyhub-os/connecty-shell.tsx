"use client";

import { useState, type ChangeEvent } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
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
  Link2,
  LogOut,
  Loader2,
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
  tone?: AccentTone;
  badge?: string;
  badgeTone?: "green" | "amber" | "rose";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type AccentTone = "teal" | "emerald" | "sky" | "blue" | "violet" | "amber" | "rose" | "fuchsia" | "slate";

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
      { label: "WhatsApp Clientes", href: "/admin/clientes/whatsapp", icon: MessageCircle, tone: "teal" },
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
      { label: "WhatsApp",     href: "/dashboard/whatsapp",       icon: MessageCircle, tone: "emerald" },
      { label: "Instagram",    href: "/dashboard/instagram",      icon: Sparkles, tone: "fuchsia" },
      { label: "Agentes",      href: "/dashboard/agentes",        icon: Bot, tone: "violet" },
      { label: "CRM / Funil",  href: "/dashboard/crm",            icon: Workflow, tone: "amber" },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { label: "Links",           href: "/dashboard/links",            icon: Link2, tone: "sky" },
      { label: "Campanhas",       href: "/dashboard/campanhas",        icon: Megaphone, tone: "fuchsia" },
      { label: "Tráfego Pago",    href: "/dashboard/trafego-pago",     icon: TrendingUp, tone: "amber" },
      { label: "Orgânico",        href: "/dashboard/trafego-organico", icon: Globe2, tone: "emerald" },
      { label: "Automações",      href: "/dashboard/automacoes",       icon: Zap, tone: "violet" },
      { label: "Produtos",        href: "/dashboard/produtos",         icon: ShoppingBag, tone: "amber" },
      { label: "Relatórios",      href: "/dashboard/relatorios",       icon: BarChart3, tone: "blue" },
      { label: "Integrações",     href: "/dashboard/integracoes",      icon: PlugZap, tone: "teal" },
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
}: {
  mode: "admin" | "client";
  children: ReactNode;
  isPlatformAdmin?: boolean;
  workspaceName?: string;
  userLabel?: string;
  activeHref?: string;
  userAvatarUrl?: string | null;
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
  const logoTone  = "white";
  const [avatarUrl, setAvatarUrl] = useState(userAvatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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
    background: "radial-gradient(circle at 14% 0%, rgba(var(--ch-accent-rgb),0.15), transparent 36rem), radial-gradient(circle at 88% 6%, rgba(var(--ch-accent-2-rgb),0.12), transparent 32rem), linear-gradient(180deg, var(--ch-bg), #05070b 72%)",
    colorScheme: "dark",
    "--ch-bg":         "#05070b",
    "--ch-surface":    "#101722",
    "--ch-surface-2":  "#182232",
    "--ch-surface-3":  "#223044",
    "--ch-border":     "rgba(196,211,232,0.24)",
    "--ch-border-soft":"rgba(196,211,232,0.15)",
    "--ch-border-strong":"rgba(224,233,246,0.36)",
    "--ch-brand-blue": "#01004c",
    "--ch-accent":     accent,
    "--ch-accent-rgb": accentRgb,
    "--ch-accent-2":   accent2,
    "--ch-accent-2-rgb": accent2Rgb,
    "--ch-panel":      "linear-gradient(180deg, rgba(var(--ch-accent-rgb),0.055), rgba(var(--ch-accent-2-rgb),0.020)), var(--ch-surface)",
    "--ch-panel-2":    "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(var(--ch-accent-rgb),0.020)), var(--ch-surface-2)",
    "--ch-text":       "#fbfdff",
    "--ch-text-rgb":   "251,253,255",
    "--ch-muted":      "#c5d0df",
    "--ch-subtle":     "#94a6bb",
    "--ch-hover":      "rgba(var(--ch-accent-rgb),0.12)",
    "--ch-dropdown-bg":"#121a27",
    "--background":    "#05070b",
    "--foreground":    "#fbfdff",
    "--card":          "#101722",
    "--card-foreground":"#fbfdff",
    "--popover":       "#121a27",
    "--popover-foreground":"#fbfdff",
    "--primary":       accent,
    "--primary-foreground":"#061015",
    "--secondary":     "#182232",
    "--secondary-foreground":"#fbfdff",
    "--muted":         "#182232",
    "--muted-foreground":"#c5d0df",
    "--accent":        "#223044",
    "--accent-foreground":"#fbfdff",
    "--border":        "rgba(196,211,232,0.24)",
    "--input":         "rgba(224,233,246,0.30)",
    "--ring":          `rgba(${accentRgb},0.48)`,
  } as CSSProperties;

  return (
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
                  <SidebarLink key={item.href} item={item} isActive={isActive(item.href, active)} />
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
              className="w-52"
              style={{ background: "var(--ch-dropdown-bg)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
            >
              <DropdownMenuLabel className="text-xs" style={{ color: "var(--ch-muted)" }}>Conta</DropdownMenuLabel>
              <DropdownMenuSeparator style={{ background: "var(--ch-border)" }} />
              {mode === "client" && (
                <DropdownMenuItem asChild className="cursor-pointer text-xs" style={{ color: "var(--ch-text)" }}>
                  <label className="flex w-full items-center">
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
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg transition"
              onMouseEnter={e => (e.currentTarget.style.background = "var(--ch-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--ch-surface-2)")}
              style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
            >
              <Bell className="h-4 w-4" style={{ color: "var(--ch-muted)" }} />
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
                className="w-52"
                style={{ background: "var(--ch-dropdown-bg)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              >
                <DropdownMenuLabel className="text-xs">
                  <div style={{ color: "var(--ch-text)" }}>{name}</div>
                  <div className="font-normal" style={{ color: "var(--ch-muted)" }}>{role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator style={{ background: "var(--ch-border)" }} />
                {mode === "client" && (
                  <DropdownMenuItem asChild className="text-xs hover:bg-white/8 cursor-pointer">
                    <label className="flex w-full items-center">
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
          style={{ background: "var(--ch-surface)", borderBottom: "1px solid var(--ch-border-strong)" }}
        >
          {sections.flatMap((s) => s.items).map((item) => {
            const Icon  = item.icon;
            const activ = isActive(item.href, active);
            const itemPalette = accentPalettes[item.tone ?? "slate"];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-3 font-mono text-[10px] whitespace-nowrap transition"
                style={activ ? {
                  background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.18), rgba(var(--ch-accent-2-rgb),0.10))",
                  border:     `1px solid rgba(var(--ch-accent-rgb),0.40)`,
                  color:      "var(--ch-text)",
                } : {
                  background: "transparent",
                  border:     `1px solid rgba(${itemPalette.accentRgb},0.22)`,
                  color:      "var(--ch-muted)",
                }}
              >
                <Icon className="h-3 w-3" style={activ ? undefined : { color: itemPalette.accent }} />
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

function isActive(href: string, current: string) {
  if (href === current) return true;
  if (href !== "/admin" && href !== "/dashboard" && current.startsWith(href)) return true;
  return false;
}

function resolveActiveItem(sections: NavSection[], active: string) {
  return sections.flatMap((s) => s.items).find((i) => isActive(i.href, active));
}
