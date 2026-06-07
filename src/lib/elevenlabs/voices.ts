import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { createServiceClient } from "@/lib/supabase/service";
import { loadElevenLabsCredentials } from "./credentials";

export type WhatsappAudioVoiceOption = {
  voiceId: string;
  name: string;
  source: "platform" | "customer" | "elevenlabs" | "library";
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
};

const remoteVoiceTimeoutMs = 6500;
const remoteVoicePageSize = 100;
const accountVoicePageLimit = 5;
const libraryVoicePageLimit = 1;
const remoteVoiceTimeoutFallback = {
  voices: [] as ElevenLabs.Voice[],
  libraryVoices: [] as ElevenLabs.LibraryVoiceResponse[],
  errorMessage: "A biblioteca de vozes do ElevenLabs demorou para responder. O painel abriu com as vozes salvas e a voz padrao.",
};

export async function listWhatsappAudioVoices(input: {
  organizationId: string;
  client?: SupabaseClient;
}): Promise<WhatsappAudioVoiceState> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadElevenLabsCredentials(client).catch((error: unknown) => {
    return {
      errorMessage: error instanceof Error ? error.message : "ElevenLabs nao configurado.",
    };
  });

  if ("errorMessage" in credentials) {
    return {
      configured: false,
      defaultVoiceId: null,
      defaultModelId: null,
      outputFormat: null,
      voices: [],
      errorMessage: credentials.errorMessage,
    };
  }

  const [remoteVoices, customerVoices] = await Promise.all([
    withTimeout(listRemoteVoices(credentials.apiKey), remoteVoiceTimeoutMs, remoteVoiceTimeoutFallback),
    listCustomerVoices(client, input.organizationId),
  ]);
  const voices = new Map<string, WhatsappAudioVoiceOption>();

  for (const voice of remoteVoices.voices) {
    if (!voice.voiceId) {
      continue;
    }

    voices.set(voice.voiceId, {
      voiceId: voice.voiceId,
      name: voice.name?.trim() || "Voz ElevenLabs",
      source: voice.voiceId === credentials.defaultVoiceId ? "platform" : "elevenlabs",
      previewUrl: normalizeUrl(voice.previewUrl),
      category: voice.category ?? null,
      status: null,
      publicOwnerId: null,
      language: firstVerifiedLanguage(voice.verifiedLanguages),
      accent: readLabel(voice.labels, "accent"),
      gender: readLabel(voice.labels, "gender"),
      useCase: readLabel(voice.labels, "use case") ?? readLabel(voice.labels, "use_case"),
      defaultForAgents: voice.voiceId === credentials.defaultVoiceId,
      isDefault: voice.voiceId === credentials.defaultVoiceId,
    });
  }

  for (const voice of remoteVoices.libraryVoices) {
    if (!voice.voiceId || voices.has(voice.voiceId)) {
      continue;
    }

    voices.set(voice.voiceId, {
      voiceId: voice.voiceId,
      name: voice.name?.trim() || "Voz ElevenLabs",
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

  for (const voice of customerVoices) {
    const voiceId = voice.provider_voice_id?.trim();

    if (!voiceId) {
      continue;
    }

    const existing = voices.get(voiceId);
    voices.set(voiceId, {
      voiceId,
      name: voice.name.trim() || existing?.name || "Voz do cliente",
      source: "customer",
      previewUrl: existing?.previewUrl ?? null,
      category: existing?.category ?? null,
      status: voice.status ?? existing?.status ?? null,
      publicOwnerId: existing?.publicOwnerId ?? null,
      language: existing?.language ?? null,
      accent: existing?.accent ?? null,
      gender: existing?.gender ?? null,
      useCase: existing?.useCase ?? null,
      defaultForAgents: Boolean(voice.default_for_agents),
      isDefault: voiceId === credentials.defaultVoiceId,
    });
  }

  if (!voices.has(credentials.defaultVoiceId)) {
    voices.set(credentials.defaultVoiceId, {
      voiceId: credentials.defaultVoiceId,
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

  return {
    configured: true,
    defaultVoiceId: credentials.defaultVoiceId,
    defaultModelId: credentials.defaultModelId,
    outputFormat: credentials.outputFormat,
    voices: Array.from(voices.values()).sort(sortVoices),
    errorMessage: remoteVoices.errorMessage,
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
        ? "Mostrando uma selecao inicial de vozes ElevenLabs para manter o painel rapido."
        : null,
    };
  } catch (error) {
    return {
      voices: [],
      libraryVoices: [],
      errorMessage: error instanceof Error ? error.message : "Nao foi possivel carregar as vozes ElevenLabs.",
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

async function listCustomerVoices(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("customer_voices")
    .select("provider_voice_id, name, status, consent_status, default_for_agents")
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
