import { describe, expect, it } from "vitest";
import * as templates from "../src/lib/whatsapp/agent-prompt-templates";
import * as responsibles from "../src/lib/agents/responsible-human";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

describe("agent card photos", () => {
  it("uses the registered photo first and only falls back to the same agent and organization", async () => {
    const row = (id: string, avatar_url: string | null = null) => ({
      id, organization_id: "org", name: id, scope: "organization", avatar_url,
      metadata: { client_created: true, agent_kind: "whatsapp" },
    });
    const db = commerceDatabase({
      agent_registry: [row("custom", "https://example.com/custom.webp"), row("linked"), row("missing")],
      whatsapp_instances: [
        { organization_id: "other", status: "connected", metadata: { agent_id: "missing", profile_image_url: "https://example.com/private.webp" } },
        { organization_id: "org", status: "archived", metadata: { agent_id: "missing", profile_image_url: "https://example.com/old.webp" } },
        { organization_id: "org", status: "connected", metadata: { agent_id: "linked", profile_image_url: "https://example.com/linked.webp" } },
        { organization_id: "org", status: "connected", metadata: { agent_id: "custom", profile_image_url: "https://example.com/ignored.webp" } },
      ],
    });
    const images = serverModuleHarness("src/lib/whatsapp/instance-profile-image.ts");
    const api = serverModuleHarness<{
      getClientAgentsWorkspace: (input: unknown, client: unknown) => Promise<{ agents: { id: string; avatarUrl: string | null; whatsappStatus: string | null }[] }>;
    }>("src/lib/client-os/agents.ts", {
      "./companies": { listClientCompanies: async () => [{ id: "org", name: "Empresa" }] },
      "@/lib/whatsapp/agent-prompt-templates": templates,
      "@/lib/agents/responsible-human": responsibles,
      "@/lib/whatsapp/instance-profile-image": images,
    });
    const { agents } = await api.getClientAgentsWorkspace({ userId: "owner", organizationId: "org", client: db.client }, db.client);
    expect(agents.map(({ id, avatarUrl }) => ({ id, avatarUrl }))).toEqual([
      { id: "custom", avatarUrl: "https://example.com/custom.webp" },
      { id: "linked", avatarUrl: "https://example.com/linked.webp" },
      { id: "missing", avatarUrl: null },
    ]);
    expect(agents.map(agent => agent.whatsappStatus)).toEqual(["connected", "connected", "draft"]);
  });

  it.each([false, true])("reads the latest connection even with a registered photo; database failure=%s", async (fail) => {
    const db = commerceDatabase({
      agent_registry: [{ id: "agent", organization_id: "org", name: "Agent", scope: "organization",
        avatar_url: "https://example.com/custom.webp", status: "needs_review",
        metadata: { client_created: true, agent_kind: "whatsapp" } }],
      whatsapp_instances: [
        { organization_id: "org", status: "connected", updated_at: "2026-09-17", metadata: { agent_id: "agent" } },
        { organization_id: "org", status: "disconnected", updated_at: "2026-09-18", metadata: { agent_id: "agent" } },
        { organization_id: "other", status: "connected", updated_at: "2026-09-19", metadata: { agent_id: "agent" } },
      ],
    }, fail ? { table: "whatsapp_instances", operation: "select" } : undefined);
    const api = serverModuleHarness<{
      getClientAgentsWorkspace: (input: unknown, client: unknown) => Promise<{ agents: { whatsappStatus: string | null; avatarUrl: string }[] }>;
    }>("src/lib/client-os/agents.ts", {
      "./companies": { listClientCompanies: async () => [{ id: "org", name: "Empresa" }] },
      "@/lib/whatsapp/agent-prompt-templates": templates,
      "@/lib/agents/responsible-human": responsibles,
      "@/lib/whatsapp/instance-profile-image": serverModuleHarness("src/lib/whatsapp/instance-profile-image.ts"),
    });
    const result = await api.getClientAgentsWorkspace({ userId: "owner", organizationId: "org", client: db.client }, db.client);
    expect(result.agents[0].whatsappStatus).toBe(fail ? null : "disconnected");
    expect(result.agents[0].avatarUrl).toBe("https://example.com/custom.webp");
  });
});
