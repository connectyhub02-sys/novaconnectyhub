import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateConnectyVoiceAudio } from "@/lib/voice/tts";
import { createServiceClient } from "@/lib/supabase/service";
import { geminiTtsVoices } from "./tts";

type GeneratedMediaPreviewRow = {
  storage_url: string | null;
};

const geminiVoicePreviewSource = "gemini_voice_preview";
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

  const cachedUrl = await findCachedPreviewUrl(client, input.organizationId, voice.voiceId);

  if (cachedUrl) {
    return cachedUrl;
  }

  const generated = await generateConnectyVoiceAudio({
    organizationId: input.organizationId,
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
      suppressTrialNotification: true,
    },
    client,
  });

  return generated.audioUrl;
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
