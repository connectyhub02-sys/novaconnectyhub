import { describe, expect, it } from "vitest";
import { activityPresets } from "../src/lib/whatsapp/activity-presets";
import { applyActivityQualification, createActivityQualification } from "../src/lib/whatsapp/activity-setup";
import { fillMissingQualificationAnswers, onboardingAnswerOptions } from "../src/lib/leads/qualification-answer-defaults";
import { defaultLeadQualificationConfig, getLeadQualificationAnswerValidationError, getLeadQualificationMaxScore, normalizeLeadQualificationConfig } from "../src/lib/leads/qualification";

describe("ready qualification answers for existing agents", () => {
  it.each(Object.entries(activityPresets))("fills every existing %s profile question without removing the fourth legacy question", (id, profile) => {
    const previous = { ...createActivityQualification(id), customized: true, questions: profile.questions.map(([key, label, question]) => ({ id: key, label, question, crmField: key, required: true, weight: 20 })) };
    const filled = applyActivityQualification(id, previous);
    expect(filled.questions.map(question => { const copy = { ...question }; delete copy.options; return copy; })).toEqual(previous.questions);
    expect(filled.questions.every(question => question.options?.length === 3)).toBe(true);
    expect(getLeadQualificationAnswerValidationError(filled)).toBeNull();
    expect(getLeadQualificationMaxScore(filled)).toBe(previous.questions.length * 20);
    expect(applyActivityQualification(id, filled)).toEqual(filled);
  });
  it("fills generic legacy questions and preserves a disabled playbook and custom thresholds", () => {
    const previous = { ...defaultLeadQualificationConfig, enabled: false, qualifyThreshold: 60, vipThreshold: 90,
      questions: defaultLeadQualificationConfig.questions.map(question => { const copy = { ...question }; delete copy.options; return copy; }) };
    const result = fillMissingQualificationAnswers(previous, "generic_sales");
    expect(result).toMatchObject({ enabled: false, qualifyThreshold: 60, vipThreshold: 90 });
    expect(result.questions.every(question => question.options?.length === 3)).toBe(true);
  });
  it("does not overwrite authored answers or restore an explicitly removed list", () => {
    const previous = createActivityQualification("corretor_imoveis");
    previous.questions[0].options![0].label = "Minha alternativa";
    previous.questions[0].options![0].points = 7;
    previous.questions[1].options = [];
    expect(fillMissingQualificationAnswers(previous, "corretor_imoveis")).toEqual(previous);
  });
  it("matches the question text rather than guessing from a reused id", () => {
    const previous = normalizeLeadQualificationConfig({ questions: [{ id: "urgency", question: "Você já utilizou este produto?", weight: 20 }] });
    expect(fillMissingQualificationAnswers(previous, "generic_sales").questions[0].options).toBeUndefined();
  });
  it.each(["business_offer", "has_product", "clone_person", "whatsapp_context", "owner_notification_phone", "main_objection", "urgency", "next_step"])("provides three ready internal answers for %s", id => {
    const options = onboardingAnswerOptions(id, 14)!;
    expect(options).toHaveLength(3);
    expect(Math.max(...options.map(option => option.points))).toBe(14);
    expect(options.every(option => option.label.length > 5)).toBe(true);
  });
  it("recognizes the older abbreviated internal question without changing its text", () => {
    const config = normalizeLeadQualificationConfig({ questions: [{ id: "whatsapp_context", question: "Esse atendimento vai rodar em um WhatsApp comercial seu ou vc ainda vai separar um numero pra isso?", weight: 10 }] });
    const result = fillMissingQualificationAnswers(config, "generic_sales");
    expect(result.questions[0].question).toBe(config.questions[0].question);
    expect(result.questions[0].options?.map(option => option.points)).toEqual([10, 6, 2]);
  });
});
