import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";
import { geminiTtsVoices } from "@/lib/gemini/tts";
import { createServiceClient } from "@/lib/supabase/service";
import { loadElevenLabsCredentials } from "./credentials";

export type WhatsappAudioVoiceSource = "platform" | "customer" | "elevenlabs" | "library" | "gemini";

export type WhatsappAudioVoiceOption = {
  voiceId: string;
  name: string;
  source: WhatsappAudioVoiceSource;
  previewUrl: string | null;
  category: string | null;
  status: string | null;
  publicOwnerId: string | null;
  language: string | null;
  accent: string | null;
  gender: string | null;
  useCase: string | null;
  defaultForAgents: boolean;
  isDefault: boolean;
};

export type WhatsappAudioVoiceState = {
  configured: boolean;
  defaultVoiceId: string | null;
  defaultModelId: string | null;
  outputFormat: string | null;
  voices: WhatsappAudioVoiceOption[];
  errorMessage: string | null;
};

type CustomerVoiceRow = {
  provider_voice_id: string | null;
  name: string;
  status: string | null;
  consent_status: string | null;
  default_for_agents: boolean | null;
  metadata: Record<string, unknown> | null;
};

const remoteVoiceTimeoutMs = 6500;
const remoteVoicePageSize = 100;
const accountVoicePageLimit = 5;
const libraryVoicePageLimit = 1;
const remoteVoiceTimeoutFallback = {
  voices: [] as ElevenLabs.Voice[],
  libraryVoices: [] as ElevenLabs.LibraryVoiceResponse[],
  errorMessage: "A biblioteca de vozes demorou para responder. O painel abriu com as vozes salvas e a voz padrao.",
};

export async function listWhatsappAudioVoices(input: {
  organizationId: string;
  client?: SupabaseClient;
}): Promise<WhatsappAudioVoiceState> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadElevenLabsCredentials(client).catch((error: unknown) => {
    return {
      errorMessage: error instanceof Error ? error.message : "Servico de voz nao configurado.",
    };
  });
  const geminiCredentials = await loadGeminiCredentials(client).catch((error: unknown) => {
    return {
      errorMessage: error instanceof Error ? error.message : "Voz economica Gemini nao configurada.",
    };
  });

  const elevenCredentialsErrorMessage = "errorMessage" in credentials ? credentials.errorMessage : null;
  const elevenCredentials = "errorMessage" in credentials ? null : credentials;
  const geminiCredentialsErrorMessage = "errorMessage" in geminiCredentials ? geminiCredentials.errorMessage : null;
  const geminiVoiceConfigured = !("errorMessage" in geminiCredentials);
  const [remoteVoices, customerVoices, previewIndex] = await Promise.all([
    !elevenCredentials
      ? Promise.resolve({
          voices: [] as ElevenLabs.Voice[],
          libraryVoices: [] as ElevenLabs.LibraryVoiceResponse[],
          errorMessage: elevenCredentialsErrorMessage,
        })
      : withTimeout(listRemoteVoices(elevenCredentials.apiKey), remoteVoiceTimeoutMs, remoteVoiceTimeoutFallback),
    elevenCredentials ? listCustomerVoices(client, input.organizationId) : Promise.resolve([] as CustomerVoiceRow[]),
    elevenCredentials ? listClonedVoicePreviews(client) : Promise.resolve(new Map<string, string>()),
  ]);
  const voices = new Map<string, WhatsappAudioVoiceOption>();

  if (elevenCredentials) {
    for (const voice of remoteVoices.voices) {
      if (!voice.voiceId) {
        continue;
      }

      voices.set(voice.voiceId, {
        voiceId: voice.voiceId,
        name: voice.name?.trim() || "Voz ConnectyHub",
        source: voice.voiceId === elevenCredentials.defaultVoiceId ? "platform" : "elevenlabs",
        previewUrl: normalizeUrl(voice.previewUrl) ?? previewIndex.get(voice.voiceId) ?? null,
        category: voice.category ?? null,
        status: null,
        publicOwnerId: null,
        language: firstVerifiedLanguage(voice.verifiedLanguages),
        accent: readLabel(voice.labels, "accent"),
        gender: readLabel(voice.labels, "gender"),
        useCase: readLabel(voice.labels, "use case") ?? readLabel(voice.labels, "use_case"),
        defaultForAgents: voice.voiceId === elevenCredentials.defaultVoiceId,
        isDefault: voice.voiceId === elevenCredentials.defaultVoiceId,
      });
    }

    for (const voice of remoteVoices.libraryVoices) {
      if (!voice.voiceId || voices.has(voice.voiceId)) {
        continue;
      }

      voices.set(voice.voiceId, {
        voiceId: voice.voiceId,
        name: voice.name?.trim() || "Voz ConnectyHub",
        source: "library",
        previewUrl: normalizeUrl(voice.previewUrl),
        category: voice.category ?? null,
        status: null,
        publicOwnerId: voice.publicOwnerId ?? null,
        language: voice.language ?? voice.locale ?? null,
        accent: voice.accent ?? null,
        gender: voice.gender ?? null,
        useCase: voice.useCase ?? voice.descriptive ?? null,
        defaultForAgents: false,
        isDefault: false,
      });
    }
  }

  if (geminiVoiceConfigured) {
    for (const voice of geminiTtsVoices) {
      voices.set(voice.voiceId, {
        voiceId: voice.voiceId,
        name: voice.displayName,
        source: "gemini",
        previewUrl: null,
        category: "voz economica",
        status: "ready",
        publicOwnerId: null,
        language: "pt-BR",
        accent: "brasileiro",
        gender: null,
        useCase: `${voice.tone} / ${voice.useCase}`,
        defaultForAgents: false,
        isDefault: false,
      });
    }
  }

  for (const voice of customerVoices) {
    const voiceId = voice.provider_voice_id?.trim();

    if (!voiceId) {
      continue;
    }

    const existing = voices.get(voiceId);
    const metadataPreview = typeof voice.metadata?.preview_url === "string" ? normalizeUrl(voice.metadata.preview_url) : null;
    voices.set(voiceId, {
      voiceId,
      name: voice.name.trim() || existing?.name || "Voz do cliente",
      source: "customer",
      previewUrl: existing?.previewUrl ?? metadataPreview ?? null,
      category: existing?.category ?? null,
      status: voice.status ?? existing?.status ?? null,
      publicOwnerId: existing?.publicOwnerId ?? null,
      language: existing?.language ?? null,
      accent: existing?.accent ?? null,
      gender: existing?.gender ?? null,
      useCase: existing?.useCase ?? null,
      defaultForAgents: Boolean(voice.default_for_agents),
      isDefault: voiceId === elevenCredentials?.defaultVoiceId,
    });
  }

  if (elevenCredentials && !voices.has(elevenCredentials.defaultVoiceId)) {
    voices.set(elevenCredentials.defaultVoiceId, {
      voiceId: elevenCredentials.defaultVoiceId,
      name: "Voz padrao ConnectyHub",
      source: "platform",
      previewUrl: null,
      category: null,
      status: null,
      publicOwnerId: null,
      language: null,
      accent: null,
      gender: null,
      useCase: null,
      defaultForAgents: true,
      isDefault: true,
    });
  }

  const fallbackGeminiVoice = geminiVoiceConfigured ? geminiTtsVoices[0]?.voiceId ?? null : null;
  const defaultVoiceId = elevenCredentials ? elevenCredentials.defaultVoiceId : fallbackGeminiVoice;
  const defaultModelId = elevenCredentials
    ? elevenCredentials.defaultModelId
    : "errorMessage" in geminiCredentials ? null : geminiCredentials.ttsModel;

  return {
    configured: voices.size > 0,
    defaultVoiceId,
    defaultModelId,
    outputFormat: elevenCredentials ? elevenCredentials.outputFormat : null,
    voices: Array.from(voices.values()).sort(sortVoices),
    errorMessage: joinErrorMessages(remoteVoices.errorMessage, geminiCredentialsErrorMessage),
  };
}

async function listRemoteVoices(apiKey: string) {
  try {
    const elevenLabs = new ElevenLabsClient({ apiKey });
    const voices: ElevenLabs.Voice[] = [];
    const libraryVoices: ElevenLabs.LibraryVoiceResponse[] = [];
    let nextPageToken: string | undefined;
    let hasMore = true;
    let voicePages = 0;

    while (hasMore && voicePages < accountVoicePageLimit) {
      const response = await elevenLabs.voices.search({
        nextPageToken,
        pageSize: remoteVoicePageSize,
        includeTotalCount: false,
        sort: "name",
        sortDirection: "asc",
      });

      voices.push(...(response.voices ?? []));
      nextPageToken = response.nextPageToken;
      hasMore = Boolean(response.hasMore && nextPageToken);
      voicePages += 1;
    }

    const accountHasMore = hasMore;
    let page = 1;
    hasMore = true;

    while (hasMore && page <= libraryVoicePageLimit) {
      const response = await elevenLabs.voices.getShared({
        page,
        pageSize: remoteVoicePageSize,
        includeCustomRates: true,
        includeLiveModerated: true,
      });

      libraryVoices.push(...(response.voices ?? []));
      hasMore = Boolean(response.hasMore);
      page += 1;
    }

    const libraryHasMore = hasMore;

    return {
      voices,
      libraryVoices,
      errorMessage: accountHasMore || libraryHasMore
        ? "Mostrando uma selecao inicial de vozes para manter o painel rapido."
        : null,
    };
  } catch (error) {
    return {
      voices: [],
      libraryVoices: [],
      errorMessage: error instanceof Error ? error.message : "Nao foi possivel carregar as vozes.",
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function listClonedVoicePreviews(client: SupabaseClient) {
  const { data } = await client
    .from("customer_voices")
    .select("provider_voice_id, metadata")
    .eq("provider", "elevenlabs")
    .not("provider_voice_id", "is", null)
    .not("metadata", "is", null);

  const index = new Map<string, string>();

  for (const row of (data ?? []) as { provider_voice_id: string | null; metadata: Record<string, unknown> | null }[]) {
    const voiceId = row.provider_voice_id?.trim();
    const preview = typeof row.metadata?.preview_url === "string" ? normalizeUrl(row.metadata.preview_url) : null;

    if (voiceId && preview) {
      index.set(voiceId, preview);
    }
  }

  return index;
}

async function listCustomerVoices(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("customer_voices")
    .select("provider_voice_id, name, status, consent_status, default_for_agents, metadata")
    .eq("organization_id", organizationId)
    .eq("provider", "elevenlabs")
    .not("provider_voice_id", "is", null)
    .order("default_for_agents", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return [] as CustomerVoiceRow[];
  }

  return ((data ?? []) as CustomerVoiceRow[]).filter((voice) => {
    const status = voice.status?.toLowerCase() ?? "";
    const consent = voice.consent_status?.toLowerCase() ?? "";

    return status !== "archived" && status !== "deleted" && consent !== "rejected";
  });
}

function sortVoices(left: WhatsappAudioVoiceOption, right: WhatsappAudioVoiceOption) {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  if (left.defaultForAgents !== right.defaultForAgents) return left.defaultForAgents ? -1 : 1;
  if (left.source !== right.source) {
    if (left.source === "customer") return -1;
    if (right.source === "customer") return 1;
    if (left.source === "gemini") return -1;
    if (right.source === "gemini") return 1;
  }

  return left.name.localeCompare(right.name, "pt-BR");
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function readLabel(labels: Record<string, string> | undefined, key: string) {
  if (!labels) {
    return null;
  }

  const found = Object.entries(labels).find(([label]) => label.toLowerCase() === key);
  return found?.[1] ?? null;
}

function firstVerifiedLanguage(languages: ElevenLabs.VerifiedVoiceLanguageResponseModel[] | undefined) {
  const first = languages?.[0];

  if (!first) {
    return null;
  }

  return first.language || first.locale || null;
}

function joinErrorMessages(...messages: Array<string | null | undefined>) {
  const unique = Array.from(new Set(messages.map((message) => message?.trim()).filter(Boolean)));
  return unique.length > 0 ? unique.join(" ") : null;
}
