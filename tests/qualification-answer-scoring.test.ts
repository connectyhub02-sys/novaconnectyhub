import { describe, expect, it } from "vitest";
import { defaultLeadQualificationConfig, getLeadQualificationAnswerValidationError, getLeadQualificationMaxScore,
  normalizeLeadQualificationAnalysis, normalizeLeadQualificationConfig, qualificationOptions } from "../src/lib/leads/qualification";
import { createProfessionalGuidanceQualification } from "../src/lib/leads/professional-guidance-qualification";
import { agentPromptTemplates } from "../src/lib/whatsapp/agent-prompt-templates";
import { applyActivityQualification, createActivityQualification } from "../src/lib/whatsapp/activity-setup";
import { activityPresets } from "../src/lib/whatsapp/activity-presets";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import * as qualificationModule from "../src/lib/leads/qualification";

const example = () => normalizeLeadQualificationConfig({ ...defaultLeadQualificationConfig,
  questions: [{ id: "used", label: "Experiência", question: "Já utilizou?", crmField: "used", required: true, weight: 40,
    options: qualificationOptions([["Sim", 20], ["Não", 5], ["Acesso sem requisito", 0, true]]) },
  { id: "when", label: "Prazo", question: "Para quando?", crmField: "when", required: true, weight: 40,
    options: qualificationOptions([["Agora", 30], ["Pesquisando", 0]]) }] });
const answer = (questionId: string, optionId: string, text = "Resposta literal") => ({ questionId, optionId, answer: text });

describe("answer-specific qualification", () => {
  it("computes different scores for yes/no and ignores model score, points and status", () => {
    const config = example();
    const yes = normalizeLeadQualificationAnalysis({ score: 2, status: "lost", answers: [answer("used", "option_1"), answer("when", "option_1")] }, config);
    const no = normalizeLeadQualificationAnalysis({ score: 100, temperature: "vip", answers: [{ ...answer("used", "option_2"), points: 999 }, answer("when", "option_1")] }, config);
    expect(yes).toMatchObject({ score: 100, rawScore: 50, maxScore: 50, status: "qualified", temperature: "vip" });
    expect(no).toMatchObject({ score: 70, rawScore: 35, temperature: "hot" });
  });
  it("distinguishes zero-point answers from unanswered questions", () => {
    const value = normalizeLeadQualificationAnalysis({ answers: [answer("when", "option_2")] }, example());
    expect(value.score).toBe(0); expect(value.answeredQuestionIds).toEqual(["when"]); expect(value.missingQuestionIds).toEqual(["used"]);
  });
  it("does not award points for populated CRM fields or answered ids", () => {
    const value = normalizeLeadQualificationAnalysis({ score: 100, temperature: "vip", status: "qualified", answeredQuestionIds: ["used", "when"], fields: { used: "Não", when: "Agora", private: "ignored" } }, example());
    expect(value.score).toBe(0); expect(value.answeredQuestionIds).toEqual([]); expect(value.fields).not.toHaveProperty("private");
  });
  it("lists unanswered optional questions without blocking qualification", () => {
    const config = example(); config.questions[1].required = false; config.questions[1].options![0].points = 1;
    const result = normalizeLeadQualificationAnalysis({ answers: [answer("used", "option_1")] }, config);
    expect(result).toMatchObject({ score: 95, status: "qualified", missingQuestionIds: ["when"] });
  });
  it("rejects unknown options, duplicate answers, empty answers and unsupported evidence", () => {
    for (const answers of [[answer("used", "fake")], [answer("fake", "option_1")], [answer("used", "option_1"), answer("used", "option_2")], [answer("used", "option_1", "")]]) {
      expect(normalizeLeadQualificationAnalysis({ answers }, example()).score).toBe(0);
    }
    expect(normalizeLeadQualificationAnalysis({ answers: [answer("used", "option_1", "Sim")] }, example(), ["Não usei"]).answeredQuestionIds).toEqual([]);
  });
  it("requires essential answers before qualified/VIP even with high score", () => {
    const config = example(); config.questions[0].options![0].points = 100; config.questions[1].options![0].points = 1;
    expect(normalizeLeadQualificationAnalysis({ answers: [answer("used", "option_1")] }, config)).toMatchObject({ score: 99, temperature: "warm", status: "active" });
  });
  it("disqualification overrides every other point and untrusted model action", () => {
    const value = normalizeLeadQualificationAnalysis({ score: 100, nextBestAction: "Fechar venda", answers: [answer("used", "option_3"), answer("when", "option_1")] }, example());
    expect(value).toMatchObject({ score: 0, temperature: "cold", status: "lost", disqualified: true });
    expect(value.nextBestAction).not.toContain("Fechar venda"); expect(value.disqualificationReasons).toHaveLength(1);
  });
  it("removing an option invalidates an old selected answer; disabling stops points", () => {
    const config = example(); config.questions[0].options = config.questions[0].options!.slice(1);
    expect(normalizeLeadQualificationAnalysis({ answers: [answer("used", "option_1")] }, config).score).toBe(0);
    config.enabled = false;
    expect(normalizeLeadQualificationAnalysis({ answers: [answer("used", "option_2"), answer("when", "option_1")] }, config).score).toBe(0);
  });
  it("validates editable responses without rewriting spaces or accepting duplicate IDs", () => {
    const config = example(); config.questions[0].options![1].id = "option_1";
    expect(getLeadQualificationAnswerValidationError(config)).toContain("diferentes");
    config.questions[0].options = [];
    expect(getLeadQualificationAnswerValidationError(config)).toContain("adicione");
  });
  it.each(agentPromptTemplates)("gives $id exactly 4 questions, 3 options and a 100-point maximum", ({ id }) => {
    const config = createActivityQualification(id);
    expect(config.questions).toHaveLength(4);
    for (const question of config.questions) expect(question.options).toHaveLength(3);
    expect(getLeadQualificationMaxScore(config)).toBe(100);
    expect(getLeadQualificationAnswerValidationError(config)).toBeNull();
    expect(config.questions[0].question).toBe(activityPresets[id].questions[0][2]);
  });
  it.each(agentPromptTemplates)("upgrades unchanged legacy $id while preserving authored questions", ({ id }) => {
    const preset = activityPresets[id]; const points = Math.floor(80 / preset.questions.length);
    const old = { ...createActivityQualification(id), activityVersion: 1, maxQuestionsPerConversation: preset.questions.length + 1,
      questions: [...preset.questions.map(([key, label, question], index) => ({ id: key, label, question, crmField: key,
        weight: points + (index === 0 ? 80 - points * preset.questions.length : 0), required: index < 2 })),
      { id: "objection", label: "Dúvidas e objeções", question: "Ficou alguma dúvida sobre o próximo passo?", crmField: "objections", weight: 20, required: false }] };
    expect(applyActivityQualification(id, old).questions.every(question => question.options?.length === 3)).toBe(true);
    old.questions[0].question = "Minha pergunta personalizada";
    expect(applyActivityQualification(id, old).questions[0].question).toBe("Minha pergunta personalizada");
    expect(applyActivityQualification(id, { ...old, enabled: false }).enabled).toBe(false);
  });
  it("preserves the custom eight-question rubric and its 110-point maximum", () => {
    const config = createProfessionalGuidanceQualification();
    expect(config.questions).toHaveLength(8); expect(getLeadQualificationMaxScore(config)).toBe(110);
    expect(getLeadQualificationAnswerValidationError(config)).toBeNull();
    const answers = config.questions.map(question => answer(question.id, question.options!.find(option => option.points === question.weight)!.id));
    expect(normalizeLeadQualificationAnalysis({ answers }, config).score).toBe(100);
    answers[7].optionId = "option_4";
    expect(normalizeLeadQualificationAnalysis({ answers }, config)).toMatchObject({ score: 0, disqualified: true });
  });
  it("runtime enrichment cannot inflate scores from CRM context", () => {
    const api = runtimeHarness({ "@/lib/leads/qualification": qualificationModule });
    const value = api<{ score: number }>("enrichLeadQualificationAnalysisWithRuntimeSignals",
      normalizeLeadQualificationAnalysis({ fields: { used: "Sim", when: "Agora" } }, example()),
      { qualification: example(), messages: [], salesCatalogOrders: [], lead: { metadata: {} } });
    expect(value.score).toBe(0);
  });
});
