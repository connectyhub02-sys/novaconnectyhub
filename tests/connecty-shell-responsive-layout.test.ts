import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync("src/components/connectyhub-os/connecty-shell.tsx", "utf8");
const globalCssSource = readFileSync("src/app/globals.css", "utf8");

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
    const shellTheme = sourceBetween(shellSource, "const shellTheme = {", "const accountDropdownStyle = {");
    const contentLayout = sourceBetween(shellSource, "connecty-shell-content mx-auto", "{children}");

    expect(shellTheme).toContain('background: "#f5f7fb"');
    expect(shellTheme).toContain('"--ch-brand-primary": "#1d4ed8"');
    expect(shellTheme).toContain('"--ch-chart-1": "#1d4ed8"');
    expect(shellTheme).not.toContain("radial-gradient(circle");
    expect(shellTheme).not.toContain("#1877f2");
    expect(shellTheme).not.toContain("#4f46e5");
    expect(contentLayout).toContain('isAttendancePage ? "max-w-none lg:px-4 xl:px-5" : "max-w-[1480px]"');
  });

  it("keeps consistent navigation colors with readable white action labels", () => {
    const palettes = sourceBetween(shellSource, "const neutralAccentPalette", "// ─── Navigation");

    for (const key of ["accent", "accent2"]) {
      const hex = palettes.match(new RegExp(`${key}: "#([a-f0-9]{6})"`))?.[1];
      expect(hex).toBeDefined();
      const channels = hex!.match(/.{2}/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      expect(1.05 / (luminance + .05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(palettes).toContain("blue: neutralAccentPalette");
    expect(palettes).toContain("emerald: neutralAccentPalette");
    expect(palettes).toContain("violet: neutralAccentPalette");
    expect(globalCssSource).toContain(".connecty-shell-logo-image");
  });

  it("exposes layout anchors for desktop sidebar, topbar, scroll area, and mobile app menu", () => {
    expect(shellSource).toContain('data-connecty-shell-root="true"');
    expect(shellSource).toContain('data-connecty-shell-sidebar="true"');
    expect(shellSource).toContain('data-connecty-shell-main="true"');
    expect(shellSource).toContain('data-connecty-shell-topbar="true"');
    expect(shellSource).toContain('data-connecty-shell-scroll="true"');
    expect(shellSource).toContain('data-connecty-mobile-menu="true"');
    expect(shellSource).toContain('className="sticky top-0 hidden h-svh w-[264px]');
    expect(shellSource).toContain("className=\"fixed inset-x-0 bottom-0 top-16");
    expect(shellSource).toContain("w-[min(calc(100vw-24px),440px)]");
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
    expect(shellSource).toContain('pathname === "/dashboard/planos"');
    expect(shellSource).toContain('pathname.startsWith("/dashboard/planos/")');
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
