import { type MetaOrganicFormat, type MetaOrganicMedia, type MetaOrganicSurface, validateOrganicComposition } from "./organic-publishing-policy";

export type OrganicDelivery = {
  surface: MetaOrganicSurface;
  accountId: string;
  phase: "preparing" | "processing" | "sending" | "published";
  children: string[];
  containerId?: string;
  videoId?: string;
  uploaded?: boolean;
  finished?: boolean;
  uploadUrl?: string;
  id?: string;
  operation?: string;
};
export class OrganicGraphRejected extends Error {}
type Graph = (surface: MetaOrganicSurface, path: string, body: Record<string, string>, method?: "GET" | "POST") => Promise<Record<string, unknown>>;

/** Checkpoints precede external mutations. Unknown outcomes are never retried blindly. */
export async function advanceOrganicDelivery(input: {
  delivery: OrganicDelivery;
  format: MetaOrganicFormat;
  media: MetaOrganicMedia[];
  caption: string;
  linkUrl?: string | null;
  graph: Graph;
  upload: (url: string, fileUrl: string) => Promise<void>;
  save: (delivery: OrganicDelivery) => Promise<void>;
}): Promise<boolean> {
  const d = input.delivery;
  const { format, media, caption } = input;
  validateOrganicComposition(format, media, [d.surface]);
  if (d.phase === "published") return true;
  if (d.phase === "sending") throw new Error("Resultado do envio incerto. Confira a publicação na Meta antes de tentar novamente; o reenvio automático foi bloqueado.");
  const graph = (path: string, body: Record<string, string>, method: "GET" | "POST" = "POST") => input.graph(d.surface, path, body, method);
  async function write(operation: string, action: () => Promise<Record<string, unknown>>, apply: (data: Record<string, unknown>) => void) {
    d.phase = "sending";
    d.operation = operation;
    await input.save(d);
    let data: Record<string, unknown>;
    try { data = await action(); }
    catch (error) {
      if (error instanceof OrganicGraphRejected) {
        d.phase = "preparing";
        delete d.operation;
        await input.save(d);
      }
      throw error;
    }
    // Keep sending if a malformed success response leaves the result unknown.
    apply(data);
    d.phase = d.id ? "published" : "processing";
    delete d.operation;
    await input.save(d);
  }
  const base = `/${d.accountId}`;
  if (d.surface === "instagram_feed") {
    if (format === "carousel") {
      for (let i = d.children.length; i < media.length; i++) {
        const m = media[i];
        await write(`child-${i}`, () => graph(`${base}/media`, { is_carousel_item: "true", ...(m.type === "video" ? { media_type: "VIDEO", video_url: m.url } : { image_url: m.url }) }), data => { d.children.push(requiredId(data)); });
      }
      for (const id of d.children) if (!await instagramReady(id)) return false;
    }
    if (!d.containerId) {
      const m = media[0];
      const body: Record<string, string> = format === "carousel" ? { media_type: "CAROUSEL", children: d.children.join(","), caption }
        : format === "story" ? { media_type: "STORIES", [m.type === "video" ? "video_url" : "image_url"]: m.url }
        : m.type === "video" ? { media_type: "REELS", video_url: m.url, caption, share_to_feed: "true" }
        : { image_url: m.url, caption };
      await write("container", () => graph(`${base}/media`, body), data => { d.containerId = requiredId(data); });
    }
    if (!await instagramReady(d.containerId!)) return false;
    await write("publish", () => graph(`${base}/media_publish`, { creation_id: d.containerId! }), data => { d.id = requiredId(data); });
    return true;
  }
  if (format === "carousel" || (format === "story" && media[0].type === "image")) {
    for (let i = d.children.length; i < media.length; i++) {
      await write(`photo-${i}`, () => graph(`${base}/photos`, { url: media[i].url, published: "false" }), data => { d.children.push(requiredId(data)); });
    }
    const body: Record<string, string> = format === "story" ? { photo_id: d.children[0] } : { message: caption, attached_media: JSON.stringify(d.children.map(id => ({ media_fbid: id }))) };
    await write("publish", () => graph(`${base}/${format === "story" ? "photo_stories" : "feed"}`, body), data => { d.id = requiredId(data); });
    return true;
  }
  if (["reel", "story", "video"].includes(format)) {
    const edge = format === "story" ? "video_stories" : "video_reels";
    if (!d.videoId) {
      await write("video-start", () => graph(`${base}/${edge}`, { upload_phase: "start" }), data => {
        d.videoId = requiredId(data, "video_id");
        const url = new URL(String(data.upload_url));
        if (url.protocol !== "https:" || url.hostname !== "rupload.facebook.com" || url.username || url.password) throw new Error("Endereço de upload Meta inválido.");
        d.uploadUrl = url.toString();
      });
    }
    if (!d.uploaded) await write("video-upload", async () => { await input.upload(d.uploadUrl!, media[0].url); return {}; }, () => { d.uploaded = true; });
    const response = await graph(`/${d.videoId}`, { fields: "status" }, "GET");
    const status = response.status as { video_status?: string; uploading_phase?: { status?: string }; processing_phase?: { status?: string }; publishing_phase?: { status?: string } } | undefined;
    if (status?.video_status === "error" || [status?.uploading_phase?.status, status?.processing_phase?.status, status?.publishing_phase?.status].includes("error")) throw new Error("A Meta recusou o processamento do vídeo. Confira formato, duração e proporção.");
    if (!d.finished) {
      if (status?.processing_phase?.status !== "complete" && status?.video_status !== "ready") return false;
      await write("video-finish", () => graph(`${base}/${edge}`, { video_id: d.videoId!, upload_phase: "finish", video_state: "PUBLISHED", description: caption }), data => {
        if (data.success !== true) throw new Error("A Meta não confirmou a finalização do vídeo.");
        d.finished = true;
      });
      return false;
    }
    if (status?.publishing_phase?.status !== "complete") return false;
    d.id = d.videoId;
    d.phase = "published";
    await input.save(d);
    return true;
  }
  await write("publish", () => media.length ? graph(`${base}/photos`, { url: media[0].url, caption, published: "true" }) : graph(`${base}/feed`, { message: caption, ...(input.linkUrl ? { link: input.linkUrl } : {}) }), data => { d.id = requiredId(data); });
  return true;

  async function instagramReady(id: string) {
    const data = await graph(`/${id}`, { fields: "status_code,status" }, "GET");
    if (["ERROR", "EXPIRED"].includes(String(data.status_code))) throw new Error("A Meta recusou ou expirou a mídia do Instagram. Confira formato, duração e proporção.");
    return data.status_code === "FINISHED";
  }
}

function requiredId(data: Record<string, unknown>, key?: string) {
  const value = key ? data[key] : data.post_id ?? data.id;
  if (typeof value !== "string" || !value) throw new Error("A Meta não retornou o identificador do envio. Confira o resultado antes de reenviar.");
  return value;
}
