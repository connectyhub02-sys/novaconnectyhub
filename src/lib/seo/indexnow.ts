import { buildCanonicalUrl, getConnectyhubSiteUrl } from "@/lib/seo/site";

const indexNowEndpoint = "https://api.indexnow.org/indexnow";

export async function submitIndexNowUrls(rawUrls: string[]) {
  const key = process.env.INDEXNOW_KEY?.trim();

  if (!key) {
    return { ok: false as const, skipped: "missing_key" as const };
  }

  const siteUrl = getConnectyhubSiteUrl();
  const site = new URL(siteUrl);
  const urlList = Array.from(new Set(rawUrls.map(normalizeIndexNowUrl).filter((url): url is string => Boolean(url)))).slice(0, 10_000);

  if (!urlList.length) {
    return { ok: false as const, skipped: "no_urls" as const };
  }

  const response = await fetch(indexNowEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: site.hostname,
      key,
      keyLocation: buildCanonicalUrl("/indexnow-key.txt"),
      urlList,
    }),
  });

  return {
    ok: response.ok,
    status: response.status,
    submitted: urlList.length,
  };
}

function normalizeIndexNowUrl(value: string) {
  try {
    const url = new URL(value, `${getConnectyhubSiteUrl()}/`);
    const site = new URL(getConnectyhubSiteUrl());

    if (url.hostname !== site.hostname) return null;
    if (url.protocol !== "https:") return null;
    if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/api")) return null;

    return url.toString();
  } catch {
    return null;
  }
}
