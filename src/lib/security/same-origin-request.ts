export function isSameOriginRequest(
  request: Request,
  env: { NODE_ENV?: string; NEXT_PUBLIC_APP_URL?: string } = process.env,
) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    // Standalone Next.js builds request.url from the internal container address.
    // Use the operator-configured public URL, never caller-controlled proxy/Host
    // headers. Production fails closed if the canonical URL is missing/invalid.
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const expected = appUrl ? new URL(appUrl)
      : env.NODE_ENV === "production" ? null : new URL(request.url);
    return expected !== null && ["http:", "https:"].includes(expected.protocol)
      && origin === expected.origin;
  } catch {
    return false;
  }
}
