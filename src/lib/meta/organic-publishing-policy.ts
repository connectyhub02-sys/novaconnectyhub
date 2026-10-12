export type MetaOrganicSurface = "facebook_page" | "instagram_feed";
export type MetaOrganicFormat = "feed" | "reel" | "story" | "carousel" | "video";
export type MetaOrganicMedia = { url: string; type: "image" | "video" };
export const metaOrganicFormats: Record<MetaOrganicFormat, string> = { feed: "Post", reel: "Reel", story: "Story", carousel: "Carrossel", video: "Vídeo" };

export function normalizeOrganicMedia(value: unknown, legacyUrl?: unknown): MetaOrganicMedia[] {
  const entries = Array.isArray(value) ? value : typeof legacyUrl === "string" && legacyUrl.trim() ? [{ url: legacyUrl, type: "image" }] : [];
  if (entries.length > 10) throw new Error("Use no máximo 10 mídias por publicação.");
  return entries.map(entry => {
    if (!entry || typeof entry !== "object" || !["image", "video"].includes(entry.type)) throw new Error("Tipo de mídia inválido.");
    const url = normalizeOptionalUrl(entry.url, "URL da mídia inválida.");
    if (!url) throw new Error("Informe a URL pública da mídia.");
    return { url, type: entry.type };
  });
}

export function normalizeOrganicFormat(value: unknown): MetaOrganicFormat {
  if (value === undefined || value === null) return "feed";
  if (typeof value === "string" && Object.hasOwn(metaOrganicFormats, value)) return value as MetaOrganicFormat;
  throw new Error("Formato de publicação inválido.");
}

export function validateOrganicComposition(format: MetaOrganicFormat, media: MetaOrganicMedia[], surfaces: MetaOrganicSurface[]) {
  if (format === "carousel") {
    if (media.length < 2 || media.length > 10) throw new Error("Carrossel exige de 2 a 10 mídias.");
    if (surfaces.includes("facebook_page") && media.some(m => m.type === "video")) throw new Error("No Facebook, o álbum aceita fotos. Para carrossel com vídeos, selecione somente Instagram.");
  } else if (media.length > 1) throw new Error("Selecione Carrossel para publicar várias mídias.");
  if ((format !== "feed" || surfaces.includes("instagram_feed")) && !media.length) throw new Error("Adicione uma mídia para este formato.");
  if (["reel", "video"].includes(format) && media[0]?.type !== "video") throw new Error("Reels e vídeos exigem um arquivo de vídeo.");
  if (format === "feed" && media.some(m => m.type === "video")) throw new Error("Selecione Vídeo ou Reel para publicar vídeo.");
}

export type NormalizedMetaOrganicDraft = {
  title: string;
  caption: string;
  linkUrl: string | null;
  mediaUrl: string | null;
  scheduledFor: string | null;
  surfaces: MetaOrganicSurface[];
  format: MetaOrganicFormat;
  media: MetaOrganicMedia[];
};

export type MetaOrganicPublishTarget =
  | {
      surface: "facebook_page";
      kind: "facebook_feed" | "facebook_photo";
      endpointPath: string;
      body: Record<string, string>;
    }
  | {
      surface: "instagram_feed";
      kind: "instagram_image";
      createEndpointPath: string;
      createBody: Record<string, string>;
      publishEndpointPath: string;
    };

const maxTitleLength = 140;
const maxCaptionLength = 2200;

export function normalizeMetaOrganicDraft(input: {
  title?: unknown;
  caption?: unknown;
  linkUrl?: unknown;
  mediaUrl?: unknown;
  scheduledFor?: unknown;
  surfaces?: unknown;
  format?: unknown;
  media?: unknown;
}): NormalizedMetaOrganicDraft {
  const caption = normalizeText(input.caption, "Escreva a legenda da publicacao.", maxCaptionLength);
  const title = normalizeOptionalText(input.title, maxTitleLength)
    ?? preview(caption, 80)
    ?? "Publicacao organica Meta";
  const linkUrl = normalizeOptionalUrl(input.linkUrl, "URL de link invalida.");
  const mediaUrl = normalizeOptionalUrl(input.mediaUrl, "URL da midia invalida.");
  const scheduledFor = normalizeMetaOrganicScheduledFor(input.scheduledFor);
  const surfaces = normalizeSurfaces(input.surfaces);
  const format = normalizeOrganicFormat(input.format);
  const media = normalizeOrganicMedia(input.media, mediaUrl);
  validateOrganicComposition(format, media, surfaces);

  return {
    title,
    caption,
    linkUrl,
    mediaUrl,
    scheduledFor,
    surfaces,
    format,
    media,
  };
}

export function normalizeMetaOrganicScheduledFor(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data de agendamento invalida.");
  }

  if (date.getTime() <= Date.now()) {
    throw new Error("Escolha uma data futura para agendar.");
  }

  return date.toISOString();
}

export function resolveMetaOrganicPublishTargets(input: {
  caption: string;
  linkUrl?: string | null;
  mediaUrl?: string | null;
  pageId?: string | null;
  instagramBusinessId?: string | null;
  surfaces: MetaOrganicSurface[];
}): MetaOrganicPublishTarget[] {
  const caption = normalizeText(input.caption, "Escreva a legenda da publicacao.", maxCaptionLength);
  const linkUrl = normalizeOptionalUrl(input.linkUrl, "URL de link invalida.");
  const mediaUrl = normalizeOptionalUrl(input.mediaUrl, "URL da midia invalida.");
  const pageId = normalizeId(input.pageId);
  const instagramBusinessId = normalizeId(input.instagramBusinessId);
  const targets: MetaOrganicPublishTarget[] = [];

  for (const surface of normalizeSurfaces(input.surfaces)) {
    if (surface === "facebook_page") {
      if (!pageId) {
        throw new Error("Pagina Facebook nao selecionada para publicar conteudo.");
      }

      if (mediaUrl) {
        targets.push({
          surface,
          kind: "facebook_photo",
          endpointPath: `/${pageId}/photos`,
          body: {
            url: mediaUrl,
            caption,
            published: "true",
          },
        });
      } else {
        targets.push({
          surface,
          kind: "facebook_feed",
          endpointPath: `/${pageId}/feed`,
          body: {
            message: caption,
            ...(linkUrl ? { link: linkUrl } : {}),
          },
        });
      }
    } else {
      if (!instagramBusinessId) {
        throw new Error("Conta Instagram Business nao selecionada para publicar conteudo.");
      }

      if (!mediaUrl) {
        throw new Error("Instagram exige uma URL publica de imagem para publicar no feed.");
      }

      targets.push({
        surface,
        kind: "instagram_image",
        createEndpointPath: `/${instagramBusinessId}/media`,
        createBody: {
          image_url: mediaUrl,
          caption,
        },
        publishEndpointPath: `/${instagramBusinessId}/media_publish`,
      });
    }
  }

  return targets;
}

export function getMetaOrganicSurfaceLabel(surface: MetaOrganicSurface) {
  switch (surface) {
    case "facebook_page":
      return "Facebook Page";
    case "instagram_feed":
      return "Instagram";
  }
}

function normalizeSurfaces(value: unknown): MetaOrganicSurface[] {
  const raw = Array.isArray(value) ? value : ["facebook_page", "instagram_feed"];
  const surfaces = Array.from(new Set(raw.filter(isMetaOrganicSurface)));

  if (!surfaces.length) {
    throw new Error("Escolha pelo menos um canal Meta.");
  }

  return surfaces;
}

function isMetaOrganicSurface(value: unknown): value is MetaOrganicSurface {
  return value === "facebook_page" || value === "instagram_feed";
}

function normalizeText(value: unknown, errorMessage: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(errorMessage);
  }

  if (text.length > maxLength) {
    throw new Error(`O texto pode ter no maximo ${maxLength} caracteres.`);
  }

  return text;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return null;
  }

  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeOptionalUrl(value: unknown, errorMessage: string) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || host === "localhost" || host.endsWith(".local") || host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      throw new Error(errorMessage);
    }

    return url.toString();
  } catch {
    throw new Error(errorMessage);
  }
}

function normalizeId(value: string | null | undefined) {
  const text = value?.trim();
  return text || null;
}

function preview(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}
