import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ search: vi.fn(), shared: vi.fn(), defaultId: "common" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@elevenlabs/elevenlabs-js", () => ({ ElevenLabsClient: class {
  voices = { search: provider.search, getShared: provider.shared };
} }));
vi.mock("@/lib/elevenlabs/credentials", () => ({
  fallbackVoiceId: "built-in-public",
  loadElevenLabsCredentials: async () => ({ apiKey: "synthetic", defaultVoiceId: provider.defaultId, defaultModelId: "eleven-model", outputFormat: "mp3_44100_128" }),
}));
vi.mock("@/lib/gemini/credentials", () => ({ loadGeminiCredentials: async () => ({ ttsModel: "gemini-model" }) }));
vi.mock("@/lib/gemini/tts", () => ({ geminiTtsVoices: [{ voiceId: "gemini-public", displayName: "Public", tone: "Warm", useCase: "Speech" }] }));
import { listWhatsappAudioVoices } from "@/lib/elevenlabs/voices";

const localVoices = [
  { organization_id: "org-a", owner_user_id: "user-a", provider_voice_id: "clone-a", name: "Clone A", status: "ready" },
  { organization_id: "org-a", owner_user_id: "user-b", provider_voice_id: "clone-b", name: "Clone B", status: "ready" },
  { organization_id: "org-b", owner_user_id: "user-a", provider_voice_id: "other-org", name: "Other organization", status: "ready" },
  { organization_id: "org-a", owner_user_id: null, provider_voice_id: "unassigned", name: "Legacy", status: "ready" },
  { organization_id: "org-a", owner_user_id: "user-a", provider_voice_id: "archived", name: "Reset clone", status: "archived" },
].map(v => ({ ...v, provider: "elevenlabs", consent_status: "accepted", default_for_agents: false, metadata: { preview_url: `https://example.test/${v.provider_voice_id}.mp3` } }));

function client(): SupabaseClient {
  return { from: () => {
    let rows = [...localVoices];
    const q = {
      select: () => q,
      eq: (key: keyof typeof localVoices[number], value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
      not: () => q,
      order: () => q,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return q;
  } } as unknown as SupabaseClient;
}

beforeEach(() => {
  provider.defaultId = "common";
  provider.search.mockReset().mockResolvedValue({ voices: [
    { voiceId: "common", name: "Common", category: "premade" },
    ...localVoices.map(v => ({ voiceId: v.provider_voice_id, name: v.name, category: "cloned", labels: { source: "connectyhub" } })),
    { voiceId: "professional-private", name: "Private professional clone", category: "professional" },
    { voiceId: "unknown-private", name: "Unknown voice" },
  ], hasMore: false });
  provider.shared.mockReset().mockResolvedValue({ voices: [{ voiceId: "public-library", name: "Public library", category: "professional" }], hasMore: false });
});

it("shows only the user's own clone in the selected organization, including its preview", async () => {
  const a = await listWhatsappAudioVoices({ organizationId: "org-a", ownerUserId: "user-a", client: client() });
  expect(a.voices.filter(v => v.source === "customer").map(v => v.voiceId)).toEqual(["clone-a"]);
  expect(a.voices.find(v => v.voiceId === "clone-a")?.previewUrl).toBe("https://example.test/clone-a.mp3");
  for (const denied of ["clone-b", "other-org", "unassigned", "archived", "professional-private", "unknown-private"]) {
    expect(JSON.stringify(a)).not.toContain(denied);
  }
  expect(a.voices.map(v => v.voiceId)).toEqual(expect.arrayContaining(["common", "public-library", "gemini-public"]));
});

it("does not show A's clone to B, even within the same organization", async () => {
  const b = await listWhatsappAudioVoices({ organizationId: "org-a", ownerUserId: "user-b", client: client() });
  expect(b.voices.filter(v => v.source === "customer").map(v => v.voiceId)).toEqual(["clone-b"]);
  expect(JSON.stringify(b)).not.toContain("clone-a");
});

it("does not carry the same user's clone across organizations", async () => {
  const b = await listWhatsappAudioVoices({ organizationId: "org-b", ownerUserId: "user-a", client: client() });
  expect(b.voices.filter(v => v.source === "customer").map(v => v.voiceId)).toEqual(["other-org"]);
  expect(JSON.stringify(b)).not.toContain("clone-a");
});

it("does not leak another owner's clone through the default or public library paths", async () => {
  provider.defaultId = "clone-b";
  provider.shared.mockResolvedValue({ voices: [{ voiceId: "clone-b", name: "Private duplicated by provider", category: "professional" }], hasMore: false });
  const a = await listWhatsappAudioVoices({ organizationId: "org-a", ownerUserId: "user-a", client: client() });
  expect(JSON.stringify(a)).not.toContain("clone-b");
  expect(a.defaultVoiceId).toBe("gemini-public");
  expect(a.defaultModelId).toBe("gemini-model");
});

it("does not invent a configured private fallback during provider failures", async () => {
  provider.defaultId = "private-configured-default";
  provider.search.mockRejectedValue(new Error("Provider unavailable"));
  const a = await listWhatsappAudioVoices({ organizationId: "org-a", ownerUserId: "user-a", client: client() });
  expect(JSON.stringify(a)).not.toContain("private-configured-default");
  expect(a.voices.find(v => v.voiceId === "clone-a")?.source).toBe("customer");
  provider.defaultId = "built-in-public";
  const publicFallback = await listWhatsappAudioVoices({ organizationId: "org-a", ownerUserId: "user-a", client: client() });
  expect(publicFallback.defaultVoiceId).toBe("built-in-public");
});
