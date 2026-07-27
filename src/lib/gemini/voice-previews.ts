import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateConnectyVoiceAudio } from "@/lib/voice/tts";
import { createServiceClient } from "@/lib/supabase/service";
import { geminiTtsVoices } from "./tts";

type GeneratedMediaPreviewRow = {
  storage_url: string | null;
};

type PreviewOrganizationRow = {
  id: string;
};

const geminiVoicePreviewSource = "gemini_voice_preview";
const previewOrganizationSlug = "connectyhub-voice-previews";
const previewText = "Oi, esta e uma previa da voz de baixo custo para atendimento no WhatsApp.";

export async function getOrCreateGeminiVoicePreviewUrl(input: {
  organizationId: string;
  userId?: string | null;
  voiceId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const voice = geminiTtsVoices.find((item) => item.voiceId === input.voiceId.trim().toLowerCase());

  if (!voice) {
    throw new Error("Voz de baixo custo invalida.");
  }

  const cacheOrganizationId = await getOrCreatePreviewOrganizationId(client, input.userId ?? null);
  const cachedUrl = await findCachedPreviewUrl(client, cacheOrganizationId, voice.voiceId);

  if (cachedUrl) {
    return cachedUrl;
  }

  const generated = await generateConnectyVoiceAudio({
    organizationId: cacheOrganizationId,
    userId: input.userId ?? null,
    text: previewText,
    voiceId: voice.voiceId,
    voiceName: voice.voiceName,
    voiceSource: "gemini",
    source: geminiVoicePreviewSource,
    metadata: {
      billingMode: "platform_absorbed",
      agentScope: "platform",
      source: geminiVoicePreviewSource,
      preview: true,
      voiceId: voice.voiceId,
      voiceName: voice.voiceName,
      voiceDisplayName: voice.displayName,
      cacheScope: "global",
      requestedOrganizationId: input.organizationId,
      suppressTrialNotification: true,
    },
    client,
  });

  return generated.audioUrl;
}

async function getOrCreatePreviewOrganizationId(client: SupabaseClient, userId: string | null) {
  const { data: existing, error: existingError } = await client
    .from("organizations")
    .select("id")
    .eq("slug", previewOrganizationSlug)
    .maybeSingle<PreviewOrganizationRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel carregar o cache global de vozes: ${existingError.message}`);
  }

  if (existing?.id) {
    return existing.id;
  }

  if (!userId) {
    throw new Error("Nao foi possivel criar o cache global de vozes sem usuario autenticado.");
  }

  const { data, error } = await client
    .from("organizations")
    .insert({
      name: "ConnectyHub Voice Previews",
      slug: previewOrganizationSlug,
      owner_id: userId,
      plan_code: "internal",
      status: "active",
    })
    .select("id")
    .single<PreviewOrganizationRow>();

  if (!error && data?.id) {
    return data.id;
  }

  if (error?.code === "23505") {
    const { data: createdByRace, error: raceError } = await client
      .from("organizations")
      .select("id")
      .eq("slug", previewOrganizationSlug)
      .maybeSingle<PreviewOrganizationRow>();

    if (!raceError && createdByRace?.id) {
      return createdByRace.id;
    }
  }

  throw new Error(error?.message ?? "Nao foi possivel criar o cache global de vozes.");
}

async function findCachedPreviewUrl(client: SupabaseClient, organizationId: string, voiceId: string) {
  const { data } = await client
    .from("generated_media")
    .select("storage_url")
    .eq("organization_id", organizationId)
    .eq("provider", "gemini")
    .eq("media_type", "audio")
    .contains("metadata", {
      source: geminiVoicePreviewSource,
      voiceId,
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<GeneratedMediaPreviewRow>();
  const url = data?.storage_url?.trim();

  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
