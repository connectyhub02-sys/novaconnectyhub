import type { CSSProperties } from "react";
import { panelNavigation } from "./panel-navigation";

/** Shared semantic palette for both authenticated panels. Keep storefront branding separate. */
export const panelColors = {
  canvas: "#FFFFFF", surface: "#FFFFFF", subtle: "#FFFFFF", inset: "#F8FAFC",
  border: "#DEE4ED", borderStrong: "#CBD4E1",
  text: "#000000", muted: "#303030",
  primary: "#3156D3", primaryHover: "#2544AC", primarySoft: "#EDF2FF",
  success: "#18765D", successSoft: "#EBF5F0",
  warning: "#916215", warningSoft: "#FBF4E7",
  danger: "#B33C4A", dangerSoft: "#FAECEE",
} as const;

/** Area colors identify destinations, never success/failure or availability. */
export const panelAreas = {
  overview: { color: "#2858C4", soft: "#EAF1FF", label: "Início e navegação" },
  service: { color: "#08757A", soft: "#E4F5F3", label: "Atendimento e clientes" },
  automation: { color: "#7046B8", soft: "#F0EAFB", label: "Agentes e automações" },
  business: { color: "#895C19", soft: "#FBF1DC", label: "Vendas e financeiro" },
  system: { color: "#486485", soft: "#EBF0F7", label: "Conta e sistema" },
} as const;
export type PanelArea = keyof typeof panelAreas;
export function panelAreaForHref(href: string): PanelArea {
  const path = href.split(/[?#]/)[0];
  if (["/dashboard/whatsapp", "/dashboard/automacoes", "/admin/agentes", "/admin/automacoes", "/admin/inteligencia", "/dashboard/voz", "/admin/voz"].includes(path)) return "automation";
  const group = panelNavigation[path]?.group;
  if (["Atendimento", "Clientes", "Operação"].includes(group)) return "service";
  if (["Vendas", "Comercial", "Financeiro"].includes(group)) return "business";
  if (["Sistema", "Conta", "Ferramentas"].includes(group)) return "system";
  return "overview";
}
export function panelAreaStyle(area: PanelArea): CSSProperties {
  return { "--ch-area": panelAreas[area].color, "--ch-area-soft": panelAreas[area].soft } as CSSProperties;
}

export const panelColorGrid = [
  { role: "Fundo", color: panelColors.canvas, foreground: panelColors.text, usage: "Área de trabalho" },
  { role: "Superfície", color: panelColors.surface, foreground: panelColors.text, usage: "Cards, menus e formulários" },
  { role: "Ação principal", color: panelColors.primary, foreground: "#FFFFFF", usage: "Salvar, responder e seleção principal" },
  { role: "Ação em foco", color: panelColors.primaryHover, foreground: "#FFFFFF", usage: "Hover e ação pressionada" },
  { role: "Seleção suave", color: panelColors.primarySoft, foreground: panelColors.primary, usage: "Abas, item selecionado e informação" },
  { role: "Texto secundário", color: panelColors.surface, foreground: panelColors.muted, usage: "Descrição, metadados e ajuda" },
  { role: "Sucesso", color: panelColors.successSoft, foreground: panelColors.success, usage: "Concluído e conectado" },
  { role: "Atenção", color: panelColors.warningSoft, foreground: panelColors.warning, usage: "Pendente e exige revisão" },
  { role: "Erro", color: panelColors.dangerSoft, foreground: panelColors.danger, usage: "Falha, crítico e ação destrutiva" },
  ...Object.values(panelAreas).map(area => ({ role: area.label, color: area.soft, foreground: area.color, usage: "Ícones e destinos; o rótulo sempre acompanha a cor" })),
] as const;

const c = panelColors;
// Compatibility bridge for existing Tailwind surfaces while new code uses semantic tokens.
const blueScale = ["#F5F7FF", "#EDF2FF", "#DCE5FF", "#B7C9F8", "#87A2ED", "#5C7BE3", c.primary, c.primaryHover, "#253B83", "#20305E", "#172341"];
const greenScale = ["#F4FAF7", c.successSoft, "#D6EAE0", "#B1D6C5", "#7DB9A0", "#479A7D", c.success, "#125B48", "#144B3D", "#163E34", "#102B24"];
const amberScale = ["#FDFBF6", c.warningSoft, "#F2E5C8", "#E7D09F", "#D2B16D", "#B48B3C", c.warning, "#785014", "#624217", "#503718", "#342413"];
const redScale = ["#FDF7F8", c.dangerSoft, "#F2D8DD", "#E6B8C1", "#D38A97", "#C26576", c.danger, "#942E3D", "#782A35", "#602731", "#401B22"];
const steps = [50,100,200,300,400,500,600,700,800,900,950];
const utilityTokens = Object.fromEntries([
  ...["blue", "sky", "cyan", "indigo", "violet", "purple", "fuchsia"].flatMap(family => steps.map((step,i) => [`--color-${family}-${step}`, blueScale[i]])),
  ...["green", "emerald", "teal"].flatMap(family => steps.map((step,i) => [`--color-${family}-${step}`, greenScale[i]])),
  ...["amber", "orange", "yellow"].flatMap(family => steps.map((step,i) => [`--color-${family}-${step}`, amberScale[i]])),
  ...["red", "rose"].flatMap(family => steps.map((step,i) => [`--color-${family}-${step}`, redScale[i]])),
]);
export const panelTheme = {
  ...utilityTokens,
  // White working surfaces and strong neutral text; area colors remain in icons.
  ...Object.fromEntries(["slate", "gray", "zinc"].flatMap(family => Object.entries({ 50: "#FFFFFF", 100: "#FFFFFF", 500: "#303030", 600: "#222222", 700: "#111111", 800: "#000000", 900: "#000000" }).map(([step, value]) => [`--color-${family}-${step}`, value]))),
  background: c.canvas, colorScheme: "light",
  "--ch-bg": c.canvas, "--ch-surface": c.surface, "--ch-surface-2": c.subtle, "--ch-surface-3": c.inset,
  "--ch-border": c.border, "--ch-border-soft": "#E9EDF3", "--ch-border-strong": c.borderStrong,
  "--ch-brand-blue": c.primary, "--ch-brand-blue-rgb": "49,86,211",
  "--ch-brand-primary": c.primary, "--ch-brand-primary-rgb": "49,86,211",
  "--ch-brand-action": c.primary, "--ch-brand-action-rgb": "49,86,211", "--ch-brand-soft": c.primarySoft,
  "--ch-whatsapp": c.success, "--ch-whatsapp-rgb": "24,118,93", "--ch-whatsapp-deep": "#125B48", "--ch-whatsapp-deep-rgb": "18,91,72", "--ch-whatsapp-soft": c.successSoft,
  "--ch-ai": panelAreas.automation.color, "--ch-ai-rgb": "112,70,184", "--ch-ai-cyan": panelAreas.service.color, "--ch-ai-cyan-rgb": "8,117,122", "--ch-ai-soft": panelAreas.automation.soft,
  "--ch-accent": c.primary, "--ch-accent-rgb": "49,86,211", "--ch-accent-2": c.primaryHover, "--ch-accent-2-rgb": "37,68,172",
  "--ch-panel": c.surface, "--ch-panel-2": c.surface,
  "--ch-text": c.text, "--ch-text-rgb": "0,0,0", "--ch-muted": c.muted, "--ch-subtle": c.muted,
  "--ch-hover": c.inset, "--ch-dropdown-bg": c.surface,
  "--ch-success": c.success, "--ch-success-rgb": "24,118,93", "--ch-success-soft": c.successSoft,
  "--ch-warning": c.warning, "--ch-warning-rgb": "145,98,21", "--ch-warning-soft": c.warningSoft,
  "--ch-danger": c.danger, "--ch-danger-rgb": "179,60,74", "--ch-danger-soft": c.dangerSoft,
  "--ch-info": c.primary, "--ch-info-rgb": "49,86,211", "--ch-info-soft": c.primarySoft,
  "--ch-chart-1": c.primary, "--ch-chart-2": "#338574", "--ch-chart-3": "#8070A8", "--ch-chart-4": "#A67E42", "--ch-chart-5": "#54728F",
  "--ch-chart-warning": c.warning, "--ch-chart-danger": c.danger, "--ch-chart-grid": c.border, "--ch-chart-axis": c.muted,
  "--background": c.canvas, "--foreground": c.text, "--card": c.surface, "--card-foreground": c.text,
  "--popover": c.surface, "--popover-foreground": c.text,
  "--primary": c.primary, "--primary-foreground": "#FFFFFF", "--secondary": c.inset, "--secondary-foreground": c.text,
  "--muted": c.inset, "--muted-foreground": c.muted, "--accent": c.primarySoft, "--accent-foreground": c.primary,
  "--destructive": c.danger, "--border": c.border, "--input": c.borderStrong, "--ring": c.primary,
  "--chart-1": "var(--ch-chart-1)", "--chart-2": "var(--ch-chart-2)", "--chart-3": "var(--ch-chart-3)", "--chart-4": "var(--ch-chart-4)", "--chart-5": "var(--ch-chart-5)",
} as CSSProperties;
