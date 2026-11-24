import { metaRecord } from "./ads-leads-context";
import { graphId, inboxAsset, inboxGraph, type InboxContext } from "./inbox-content";
import type { InboxNetwork } from "./inbox-model";

/** Métricas por publicação. null = a Meta não informou (permissão, tipo de mídia ou dado ainda não processado). */
export type ContentMetrics = { views: number | null; reach: number | null; interactions: number | null };
export type ContentMetricsResult = Record<string, ContentMetrics & { unavailable?: boolean }>;

export const MAX_METRIC_IDS = 25;
/** Permissões Meta exigidas para visualizações e alcance de cada rede. */
export const insightPermissions: Record<InboxNetwork, string> = { instagram: "instagram_manage_insights", facebook: "read_insights" };
export function missingInsightPermissions(network: InboxNetwork, grantedScopes: string[]) {
  return grantedScopes.includes(insightPermissions[network]) ? [] : [insightPermissions[network]];
}
const IG_METRICS = ["views", "reach", "total_interactions"] as const;
const FB_METRICS = ["post_media_view", "post_total_media_view_unique"] as const;

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Lê o bloco insights{data:[{name, values:[{value}]}]} devolvido pela Graph. */
export function readInsightValues(insights: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const data = metaRecord(insights).data;
  if (!Array.isArray(data)) return out;
  for (const row of data.map(metaRecord)) {
    const values = Array.isArray(row.values) ? row.values.map(metaRecord) : [];
    const value = values.length ? num(values[values.length - 1].value) : num(row.total_value && metaRecord(row.total_value).value);
    if (typeof row.name === "string") out[row.name] = value;
  }
  return out;
}

export function mapInstagramMetrics(values: Record<string, number | null>): ContentMetrics {
  return { views: values.views ?? null, reach: values.reach ?? null, interactions: values.total_interactions ?? null };
}

export function mapFacebookMetrics(values: Record<string, number | null>, post: Record<string, unknown>): ContentMetrics {
  const reactions = num(metaRecord(metaRecord(post.reactions).summary).total_count);
  const comments = num(metaRecord(metaRecord(post.comments).summary).total_count);
  const shares = num(metaRecord(post.shares).count) ?? (reactions !== null ? 0 : null);
  const interactions = reactions === null && comments === null ? null : (reactions ?? 0) + (comments ?? 0) + (shares ?? 0);
  const views = values.post_media_view ?? null;
  // Em Reels do Facebook a Graph tem devolvido 0 visualizadores únicos mesmo com visualizações; 0 seria um número falso.
  const unique = values.post_total_media_view_unique ?? null;
  const reach = unique === 0 && (views ?? 0) > 0 ? null : unique;
  return { views, reach, interactions };
}

async function instagramMetrics(ctx: InboxContext, id: string, owner: string): Promise<ContentMetrics | null> {
  // Pede tudo numa chamada; se a Meta recusar o conjunto, tenta métrica por métrica para salvar o que existir.
  try {
    const data = await inboxGraph(ctx, "instagram", id, { fields: `owner,insights.metric(${IG_METRICS.join(",")})` });
    if (metaRecord(data.owner).id !== owner) return null;
    return mapInstagramMetrics(readInsightValues(data.insights));
  } catch {
    const base = await inboxGraph(ctx, "instagram", id, { fields: "owner" });
    if (metaRecord(base.owner).id !== owner) return null;
    const values: Record<string, number | null> = {};
    for (const metric of IG_METRICS) {
      try { Object.assign(values, readInsightValues((await inboxGraph(ctx, "instagram", id, { fields: `insights.metric(${metric})` })).insights)); }
      catch { values[metric] = null; }
    }
    return mapInstagramMetrics(values);
  }
}

async function facebookMetrics(ctx: InboxContext, id: string, page: string): Promise<ContentMetrics | null> {
  if (!id.startsWith(`${page}_`)) return null;
  const engagement = "from,reactions.summary(total_count).limit(0),comments.summary(true).limit(0),shares";
  try {
    const data = await inboxGraph(ctx, "facebook", id, { fields: `${engagement},insights.metric(${FB_METRICS.join(",")})` });
    if (metaRecord(data.from).id !== page) return null;
    return mapFacebookMetrics(readInsightValues(data.insights), data);
  } catch {
    const data = await inboxGraph(ctx, "facebook", id, { fields: engagement });
    if (metaRecord(data.from).id !== page) return null;
    return mapFacebookMetrics({}, data);
  }
}

/** Consulta somente publicações do perfil selecionado da organização; IDs de outro perfil voltam indisponíveis. */
export async function readContentMetrics(ctx: InboxContext, network: InboxNetwork, ids: string[]): Promise<ContentMetricsResult> {
  const unique = [...new Set(ids)].filter(graphId).slice(0, MAX_METRIC_IDS);
  const asset = inboxAsset(ctx, network);
  const result: ContentMetricsResult = {};
  const empty = { views: null, reach: null, interactions: null, unavailable: true };
  for (let i = 0; i < unique.length; i += 5) {
    await Promise.all(unique.slice(i, i + 5).map(async (id) => {
      try {
        const metrics = network === "instagram" ? await instagramMetrics(ctx, id, asset) : await facebookMetrics(ctx, id, asset);
        result[id] = metrics ?? empty;
      } catch {
        result[id] = empty;
      }
    }));
  }
  return result;
}
