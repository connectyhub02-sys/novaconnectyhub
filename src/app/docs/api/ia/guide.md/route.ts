import { renderAiGuide } from "@/lib/ai-api/guide";

export const dynamic = "force-static";

export function GET() {
  return new Response(renderAiGuide(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="connectyhub-ia-guia.md"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
