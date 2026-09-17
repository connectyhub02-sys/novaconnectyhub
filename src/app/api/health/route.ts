export const dynamic = "force-dynamic";

// Process liveness only. Dependency health stays behind the Admin OS boundary.
export function GET() {
  return Response.json({ status: "ok", version: process.env.VERCEL_GIT_COMMIT_SHA ?? null }, { headers: { "Cache-Control": "no-store" } });
}
