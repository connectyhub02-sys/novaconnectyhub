import { voiceOpenApiSpec } from "@/lib/voice-api/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(voiceOpenApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": 'attachment; filename="connectyhub-voz-openapi.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
