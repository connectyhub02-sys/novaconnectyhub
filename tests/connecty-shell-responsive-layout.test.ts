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

    expect(shellTheme).toContain("linear-gradient(180deg, #ffffff 0%, #f7f7f8");
    expect(shellTheme).toContain('"--ch-brand-primary": "#111827"');
    expect(shellTheme).toContain('"--ch-chart-1": "#111827"');
    expect(shellTheme).not.toContain("radial-gradient(circle");
    expect(shellTheme).not.toContain("#1877f2");
    expect(shellTheme).not.toContain("#4f46e5");
    expect(contentLayout).toContain('isAttendancePage ? "max-w-none lg:px-4 xl:px-5" : "max-w-[1480px]"');
  });

  it("maps every route tone to the same neutral dashboard accent", () => {
    const palettes = sourceBetween(shellSource, "const neutralAccentPalette", "// ─── Navigation");

    expect(palettes).toContain('accent: "#111827"');
    expect(palettes).toContain('accent2: "#52525b"');
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

  it("guards shell content against mobile overflow", () => {
    expect(globalCssSource).toContain("[data-connecty-shell-scroll=\"true\"]");
    expect(globalCssSource).toContain("overflow-x: clip;");
    expect(globalCssSource).toContain(".connecty-shell-content table");
    expect(globalCssSource).toContain("min-width: max-content;");
    expect(globalCssSource).toContain("[data-connecty-mobile-menu=\"true\"] button");
  });
});
