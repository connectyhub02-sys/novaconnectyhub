import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isClientBillingRecoveryPage } from "../src/lib/billing/recovery-paths";
import { panelColors, panelTheme } from "../src/lib/ui/panel-theme";

const shellSource = readFileSync("src/components/connectyhub-os/connecty-shell.tsx", "utf8");
const globalCssSource = readFileSync("src/app/globals.css", "utf8");

function luminance(color: string) {
  const hex = color.replace("#", "");
  const channels = hex.match(/.{2}/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("Connecty shell responsive layout", () => {
  it("uses the active navigation tone instead of a fixed shell accent", () => {
    expect(shellSource).toContain('const activeTone: AccentTone = activeItem?.tone ?? "blue";');
  });

  it("keeps the shell background neutral and the attendance workspace full-width", () => {
    const contentLayout = sourceBetween(shellSource, "connecty-shell-content mx-auto", "{children}");
    const canvas = String(panelTheme["--ch-bg" as keyof typeof panelTheme]);

    expect(luminance(canvas)).toBeGreaterThan(0.85);
    expect(JSON.stringify(panelTheme)).not.toContain("radial-gradient(");
    expect(shellSource).toContain("style={shellTheme}");
    expect(contentLayout).toContain('"max-w-none lg:px-4 xl:px-5"');
    expect(contentLayout).toContain('"max-w-[1480px]"');
  });

  it("keeps consistent navigation colors with readable labels on the dark sidebar", () => {
    const token = (name: string) => String(panelTheme[name as keyof typeof panelTheme]);
    const sidebar = token("--ch-sidebar-bg");

    for (const name of ["--ch-sidebar-fg", "--ch-sidebar-strong", "--ch-sidebar-muted"]) {
      expect(contrast(token(name), sidebar), name).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(panelColors.primary, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(shellSource).toContain("ch-nav-link");
    expect(shellSource).toContain('data-active={active || undefined}');
    expect(globalCssSource).toContain(".connecty-shell-logo-image");
    expect(globalCssSource).toContain(".ch-brand-name");
  });

  it("exposes layout anchors for desktop sidebar, topbar, scroll area, and mobile app menu", () => {
    expect(shellSource).toContain('data-connecty-shell-root="true"');
    expect(shellSource).toContain('data-connecty-shell-sidebar="true"');
    expect(shellSource).toContain('data-connecty-shell-main="true"');
    expect(shellSource).toContain('data-connecty-shell-topbar="true"');
    expect(shellSource).toContain('data-connecty-shell-scroll="true"');
    expect(shellSource).toContain('data-connecty-mobile-menu="true"');
    expect(shellSource).toContain('className="sticky top-0 hidden h-svh w-[248px]');
    expect(shellSource).toContain('className="ch-sheet"');
    expect(shellSource).toContain("connecty-mobile-dock ch-tabbar");
    expect(globalCssSource).toContain(".ch-sheet {");
    expect(globalCssSource).toContain("env(safe-area-inset-bottom)");
  });

  it("does not expose the Client OS switch from Admin OS", () => {
    expect(shellSource).toContain('const switchTo  = "/admin";');
    expect(shellSource).toContain('const canSwitch = mode === "client" && isPlatformAdmin;');
    expect(shellSource).not.toContain('mode === "admin" ? "/dashboard" : "/admin"');
  });

  it("lets blocked clients reach the plan checkout instead of covering it with the billing lock", () => {
    expect(shellSource).toContain("const isBillingRecoveryPage = isClientBillingRecoveryPage(active);");
    expect(shellSource).toContain("!isAttendancePage && !isBillingRecoveryPage ? <BillingStatusBanner");
    expect(shellSource).toContain("!accountCompletionGateActive && !isBillingRecoveryPage ? (");
    expect(isClientBillingRecoveryPage("/dashboard/planos")).toBe(true);
    expect(isClientBillingRecoveryPage("/dashboard/planos/checkout")).toBe(true);
    expect(isClientBillingRecoveryPage("/dashboard/planos-outro")).toBe(false);
    expect(shellSource).not.toContain('active !== "/dashboard/planos"');
  });

  it("guards shell content against mobile overflow", () => {
    expect(globalCssSource).toContain("[data-connecty-shell-scroll=\"true\"]");
    expect(globalCssSource).toContain("overflow-x: clip;");
    expect(globalCssSource).toContain(".connecty-shell-content table");
    expect(globalCssSource).toContain("min-width: max-content;");
    expect(globalCssSource).toContain("[data-connecty-mobile-menu=\"true\"] button");
  });
});
