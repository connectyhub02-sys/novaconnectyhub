import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as attendance from "../src/lib/whatsapp/responsible-attendance";
import * as behavior from "../src/lib/whatsapp/agent-behavior";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";

describe("responsible gates at real attendance boundaries", () => {
  it("does not enqueue the ninth-digit variant for the assigned agent", async () => {
    const db = commerceDatabase({
      whatsapp_instances: [{ id: "instance", metadata: { agent_id: "agent", behavior_config: { ...behavior.defaultWhatsappBehaviorConfig, agentEnabled: true } } }],
      agent_registry: [{ id: "agent", organization_id: "org", scope: "organization", metadata: { client_created: true, agent_kind: "whatsapp", responsible_humans: [{ phone: "5511987654321" }] } }],
    });
    const api = serverModuleHarness<{ enqueueWhatsappAgentRun: (client: unknown, input: unknown) => Promise<unknown> }>("src/lib/whatsapp/webhook-ingest.ts", {
      "./responsible-attendance": attendance,
      "./agent-behavior": behavior,
    });
    expect(await api.enqueueWhatsappAgentRun(db.client, {
      organizationId: "org", whatsappInstanceId: "instance", conversationId: "conversation", phoneNumber: "551187654321", providerChatId: "551187654321@s.whatsapp.net", isGroupChat: false,
    })).toBeNull();
    expect(db.tables.agent_runs ?? []).toHaveLength(0);
  });

  it("rechecks before provider generation, voice generation, and every delivery; leaves administrative sends outside attendance unchanged", async () => {
    const db = commerceDatabase({ agent_registry: [{ id: "agent", organization_id: "org", metadata: { responsible_humans: [] } }] });
    const fetch = vi.fn(async () => new Response('{"ok":true}'));
    const tts = vi.fn();
    const api = serverModuleHarness<{
      outboundBillingScope: AsyncLocalStorage<unknown>;
      fetchWithTimeout: (url: string, init: object, timeout: number, label: string) => Promise<unknown>;
      callUazapi: (credentials: object, path: string, options: object) => Promise<unknown>;
      sendAudioOutboundChunk: (input: unknown) => Promise<unknown>;
    }>("src/lib/whatsapp/agent-runtime.ts", {
      "node:async_hooks": { AsyncLocalStorage },
      "./responsible-attendance": attendance,
      "@/lib/billing/contract-access": { assertContractAccess: async () => undefined },
      "@/lib/voice/tts": { generateConnectyVoiceAudio: tts },
      "./outbound-language": { normalizeOutboundLanguageText: (s: string) => s },
    }, ["outboundBillingScope", "fetchWithTimeout", "callUazapi", "sendAudioOutboundChunk"], { fetch, setTimeout, clearTimeout, AbortController });
    const scope = {
      organizationId: "org", client: db.client, instanceId: "instance",
      assertAttendance: () => attendance.assertAgentAttendanceAllowed(db.client as unknown as SupabaseClient, { organizationId: "org", agentId: "agent", phone: "551187654321" }),
    };
    const credentials = { baseUrl: "https://fixture.invalid" };
    const send = () => api.callUazapi(credentials, "/send/text", { method: "POST", body: { number: "551187654321", text: "Test" } });
    await api.outboundBillingScope.run(scope, async () => {
      await api.fetchWithTimeout("https://fixture.invalid/generate", {}, 1000, "Test");
      db.tables.agent_registry[0].metadata = { responsible_humans: [{ phone: "5511987654321" }] };
      await expect(api.fetchWithTimeout("https://fixture.invalid/generate", {}, 1000, "Test")).rejects.toBeInstanceOf(attendance.ResponsibleAttendanceBlocked);
      await expect(send()).rejects.toBeInstanceOf(attendance.ResponsibleAttendanceBlocked);
      await expect(api.sendAudioOutboundChunk({ context: {}, text: "Test" })).rejects.toBeInstanceOf(attendance.ResponsibleAttendanceBlocked);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(tts).not.toHaveBeenCalled();
    await send(); // An explicit administrative send does not inherit an attendance gate.
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
