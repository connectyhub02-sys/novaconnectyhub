// Run after activating and checking a release. This submits only the platform sitemap.
const origin = "https://www.connectyhub.com.br";
const key = process.env.INDEXNOW_KEY?.trim();
if (!key || !/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error("Configure INDEXNOW_KEY before submission.");
const response = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}`);
const xml = await response.text();
const urlList = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]))];
if (!urlList.length || urlList.length > 10000) throw new Error("Invalid platform sitemap size.");
for (const raw of urlList) {
  const url = new URL(raw);
  if (url.origin !== origin || url.search || url.hash || /^\/(admin|api|auth|dashboard|loja|r|login|checkout)(\/|$)/.test(url.pathname))
    throw new Error("Unexpected URL in platform sitemap; no submission made.");
}
const proof = await fetch(`${origin}/indexnow-key.txt`, { signal: AbortSignal.timeout(15000) });
if (!proof.ok || (await proof.text()).trim() !== key) throw new Error("Public IndexNow key is not ready.");
const result = await fetch("https://api.indexnow.org/indexnow", { method: "POST", signal: AbortSignal.timeout(20000),
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: new URL(origin).hostname, key, keyLocation: `${origin}/indexnow-key.txt`, urlList }) });
console.log(JSON.stringify({ status: result.status, accepted: result.ok, submitted: urlList.length }));
if (!result.ok) process.exitCode = 1;
