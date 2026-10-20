import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { internalAgentBehavior, internalAgentResponsiblePatch } from "../src/lib/agents/internal-agent-settings";
import { defaultWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";
import { readAgentResponsibleHumans } from "../src/lib/agents/responsible-human";
import { defaultAgentChannelConfig } from "../src/lib/agents/multichannel";
import { createActivitySetup } from "../src/lib/whatsapp/activity-setup";
import { buildAgentPromptFromTemplate, promptBuilderMetadataKey } from "../src/lib/whatsapp/agent-prompt-templates";

const first = { name: "Responsável A", phone: "5511999990001" };
const second = { name: "Responsável B", phone: "5511999990002" };
const behavior = { ...defaultWhatsappBehaviorConfig, agentEnabled: false, audioVoiceId: "existing-voice", humanHandoffNotificationNumbers: second.phone };

describe("internal agent recipient settings", () => {
  it("preserves existing agents when the new field is omitted", () => {
    expect(internalAgentResponsiblePatch(undefined, behavior)).toEqual({});
    expect(internalAgentBehavior({}, behavior)).toMatchObject({ humanHandoffNotificationNumbers: second.phone, agentEnabled: false });
  });
  it.each([[], [{ name: "", phone: first.phone }], [{ name: first.name, phone: "123" }]].map(value => ({ value })))("rejects incomplete contacts: $value", ({ value }) => {
    expect(() => internalAgentResponsiblePatch(value, behavior)).toThrow();
  });
  it("saves, reopens and removes contacts without reviving stale recipients", () => {
    const original = internalAgentResponsiblePatch([first, second], behavior);
    const edited = { ...original, ...internalAgentResponsiblePatch([first], original.whatsapp_behavior_config) };
    expect(readAgentResponsibleHumans(edited).map(item => item.phone)).toEqual([first.phone]);
    expect(internalAgentBehavior(edited, behavior)).toMatchObject({ humanHandoffNotificationNumbers: first.phone, agentEnabled: false, audioVoiceId: "existing-voice" });
  });
  it("does not turn notifications back on when a user pauses them", () => {
    const metadata = internalAgentResponsiblePatch([first], behavior);
    expect(internalAgentBehavior(metadata, { ...behavior, humanHandoffNotifications: false })).toMatchObject({ humanHandoffNotifications: false, humanHandoffNotificationNumbers: first.phone });
  });
});

// Execute the actual profile writer with an in-memory persistence boundary.
function profileHarness() {
  const file = ts.createSourceFile("console.ts", readFileSync("src/lib/admin/platform-whatsapp-console.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "updatePlatformWhatsappConsoleAgentProfile")!;
  const agent = { id: "internal-agent", name: "Internal name", persona_name: "Persona", metadata: { sentinel: "preserve", whatsapp_behavior_config: behavior }, prompt: "Keep instructions", role_title: "Support" };
  const instance = { id: "internal-instance", metadata: { connection: "preserve", behavior_config: behavior } };
  const writes: Array<{ table: string; row: Record<string, unknown>; filters: unknown[] }> = [];
  const client = { from: (table: string) => ({ update: (row: Record<string, unknown>) => {
    const entry = { table, row, filters: [] as unknown[] }; writes.push(entry);
    const chain = { eq: (...args: unknown[]) => { entry.filters.push(args); return chain; }, is: (...args: unknown[]) => { entry.filters.push(args); return chain; }, then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
    return chain;
  } }) };
  const writer = runInNewContext(ts.transpileModule(fn.getText(file).replace("export ", "") + "\nupdatePlatformWhatsappConsoleAgentProfile", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    requirePlatformWhatsappSector: async () => ({ id: "sector", name: "Support" }), requireSectorWhatsappAgent: async () => agent,
    getSectorWhatsappInstance: async () => instance, normalizeAgentProfileName: (value: unknown) => value,
    isElianeWhatsappAgentIdentity: () => false, isElianeAgentName: () => false,
    normalizeAgentRoleTitle: (value: unknown) => value, normalizeAgentDescription: (value: unknown) => value,
    normalizeAgentAutomationRoles: (value: unknown) => value ?? {}, readAutomationRoles: () => ({}),
    internalAgentResponsiblePatch, getBehaviorConfig: () => behavior,
    getAgentChannelConfig: () => defaultAgentChannelConfig,
    validateAgentChannelSelection: async (_client: unknown, organizationId: unknown, value: typeof defaultAgentChannelConfig) => {
      expect(organizationId).toBeNull();
      if (value.channels.instagram_direct.enabled) throw new Error("Requires company");
      return value;
    },
    readRecord: (value: unknown) => value, revalidateWhatsappAdmin: () => undefined,
    getPlatformWhatsappConsoleState: async () => ({ agent }),
  }) as (input: Record<string, unknown>) => Promise<unknown>;
  return { writes, save: (extra: Record<string, unknown>) => writer({ client, sectorId: "sector", userId: "admin", ...extra }) };
}

describe("internal agent profile persistence", () => {
  it("writes the selected recipients to both agent and connected instance with platform scope", async () => {
    const h = profileHarness();
    await h.save({ responsibleHumans: [first], name: "Internal name", personaName: "Persona" });
    expect(h.writes).toHaveLength(2);
    expect(h.writes[0]).toMatchObject({ table: "agent_registry", row: { name: "Internal name", persona_name: "Persona", metadata: { sentinel: "preserve", whatsapp_behavior_config: { humanHandoffNotificationNumbers: first.phone, agentEnabled: false } } } });
    expect(h.writes[0].filters).toEqual([["id", "internal-agent"], ["scope", "platform"], ["organization_id", null]]);
    expect(h.writes[1]).toMatchObject({ table: "whatsapp_instances", row: { metadata: { connection: "preserve", behavior_config: { humanHandoffNotificationNumbers: first.phone } } } });
    expect(h.writes[0].row).not.toHaveProperty("prompt");
  });
  it("rejects invalid recipients and unsupported Meta activation before any write", async () => {
    const h = profileHarness();
    await expect(h.save({ responsibleHumans: [] })).rejects.toThrow();
    await expect(h.save({ channelConfig: { ...defaultAgentChannelConfig, channels: { ...defaultAgentChannelConfig.channels, instagram_direct: { ...defaultAgentChannelConfig.channels.instagram_direct, enabled: true } } } })).rejects.toThrow("Requires company");
    expect(h.writes).toEqual([]);
  });
});

it("creates an internal agent with the same activity, qualification and personality defaults as the client", async () => {
  const file = ts.createSourceFile("agents.ts", readFileSync("src/lib/admin/platform-whatsapp-agents.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createPlatformWhatsappAgent")!;
  let inserted: Record<string, unknown> = {};
  const client = { from: () => ({ insert: (row: Record<string, unknown>) => {
    inserted = row;
    return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
  } }) };
  const create = runInNewContext(ts.transpileModule(fn.getText(file).replace("export ", "") + "\ncreatePlatformWhatsappAgent", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    requireActiveSector: async () => ({ id: "sector", name: "Support", sectorCode: "support" }),
    normalizeAgentName: (value: unknown) => value, isElianeAgentName: () => false,
    normalizeRoleTitle: () => "Support", createActivitySetup, buildAgentPromptFromTemplate,
    createAgentCode: () => "agent", defaultAgentChannelConfig, defaultWhatsappBehaviorConfig,
    defaultWhatsappCloneProfile: {}, defaultWhatsappCloneMemory: {}, defaultLeadQualificationConfig: {},
    leadQualificationConfigKey: "lead_qualification_config", promptBuilderMetadataKey,
    internalAgentResponsiblePatch, defaultGeminiModel: "model", mapAgent: (value: unknown) => value,
  }) as (input: Record<string, unknown>) => Promise<unknown>;
  await create({ client, sectorId: "sector", name: "Ana", templateId: "academia_suplementos", responsibleHumans: [first], userId: "admin" });
  const expected = createActivitySetup("academia_suplementos", "Ana");
  expect(inserted).toMatchObject({ scope: "platform", organization_id: null, metadata: {
    [promptBuilderMetadataKey]: expected.config, whatsapp_clone_profile: expected.cloneProfile,
    lead_qualification_config: expected.qualification,
    whatsapp_behavior_config: { humanHandoffNotificationNumbers: first.phone },
  } });
  expect(inserted.prompt).toBe(buildAgentPromptFromTemplate({ config: expected.config, companyName: "Support", agentName: "Ana" }));
});
