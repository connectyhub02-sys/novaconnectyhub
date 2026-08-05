import { describe, expect, it } from "vitest";
import { defaultWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";
import {
  buildTuringScenarioRunbookMarkdown,
  criticalTuringScenarioCategories,
  getTuringStressCoverageSummary,
  listTuringStressScenarios,
  turingStressScenarios,
  type TuringScenarioCategory,
} from "../src/lib/agents/turing-stress-scenarios";

describe("agent Turing stress scenarios", () => {
  it("keeps scenario ids unique and reviewable", () => {
    const ids = turingStressScenarios.map((scenario) => scenario.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(turingStressScenarios.length).toBeGreaterThanOrEqual(40);

    for (const scenario of turingStressScenarios) {
      expect(scenario.title.trim()).not.toBe("");
      expect(scenario.leadMessages.length).toBeGreaterThan(0);
      expect(scenario.expectedHandling.trim()).not.toBe("");
      expect(scenario.failureSignals.length).toBeGreaterThan(0);
      expect(scenario.passCriteria.length).toBeGreaterThan(0);
    }
  });

  it("covers every critical risk category", () => {
    const covered = new Set<TuringScenarioCategory>(turingStressScenarios.map((scenario) => scenario.category));

    for (const category of criticalTuringScenarioCategories) {
      expect(covered.has(category)).toBe(true);
    }
  });

  it("covers user, admin, WhatsApp, public social and private social surfaces", () => {
    const summary = getTuringStressCoverageSummary();

    expect(summary.panels).toContain("user_panel");
    expect(summary.panels).toContain("admin_panel");
    expect(summary.panels).toContain("shared");
    expect(summary.surfaces).toContain("whatsapp");
    expect(summary.surfaces).toContain("whatsapp_group");
    expect(summary.surfaces).toContain("instagram_comments");
    expect(summary.surfaces).toContain("facebook_comments");
    expect(summary.surfaces).toContain("instagram_direct");
    expect(summary.surfaces).toContain("facebook_messenger");
    expect(summary.highOrCritical).toBeGreaterThan(25);
  });

  it("only references behavior flags that exist in WhatsApp behavior config", () => {
    const behaviorKeys = new Set(Object.keys(defaultWhatsappBehaviorConfig));

    for (const scenario of turingStressScenarios) {
      for (const flag of scenario.requiredBehaviorFlags) {
        expect(behaviorKeys.has(flag)).toBe(true);
      }
    }
  });

  it("filters scenarios by panel, surface and severity", () => {
    const adminCritical = listTuringStressScenarios({
      panel: "admin_panel",
      minSeverity: "critical",
    });
    const publicComments = listTuringStressScenarios({
      surface: "instagram_comments",
    });
    const userPanelFollowUps = listTuringStressScenarios({
      panel: "user_panel",
      category: "follow_up",
    });

    expect(adminCritical.every((scenario) => scenario.severity === "critical")).toBe(true);
    expect(adminCritical.some((scenario) => scenario.id === "admin-delete-instance-pressure")).toBe(true);
    expect(publicComments.every((scenario) => scenario.surfaces.includes("instagram_comments"))).toBe(true);
    expect(userPanelFollowUps.some((scenario) => scenario.id === "follow-up-too-soon")).toBe(true);
  });

  it("renders a compact runbook from the same source of truth", () => {
    const markdown = buildTuringScenarioRunbookMarkdown(turingStressScenarios.slice(0, 2));

    expect(markdown).toContain("identity-direct-robot-question");
    expect(markdown).toContain("Sinais de quebra");
    expect(markdown).toContain("Criterios de aprovacao");
  });
});
