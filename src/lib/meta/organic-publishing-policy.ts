export type MetaOrganicSurface = "facebook_page" | "instagram_feed";

export type NormalizedMetaOrganicDraft = {
  title: string;
  caption: string;
  linkUrl: string | null;
  mediaUrl: string | null;
  surfaces: MetaOrganicSurface[];
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
  surfaces?: unknown;
}): NormalizedMetaOrganicDraft {
  const caption = normalizeText(input.caption, "Escreva a legenda da publicacao.", maxCaptionLength);
  const title = normalizeOptionalText(input.title, maxTitleLength)
    ?? preview(caption, 80)
    ?? "Publicacao organica Meta";
  const linkUrl = normalizeOptionalUrl(input.linkUrl, "URL de link invalida.");
  const mediaUrl = normalizeOptionalUrl(input.mediaUrl, "URL da midia invalida.");
  const surfaces = normalizeSurfaces(input.surfaces);

  return {
    title,
    caption,
    linkUrl,
    mediaUrl,
    surfaces,
  };
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
      return "Instagram Feed";
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

    if (url.protocol !== "http:" && url.protocol !== "https:") {
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
