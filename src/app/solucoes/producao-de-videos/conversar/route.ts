import { NextResponse } from "next/server";
import { resolvePlatformWhatsappPhone } from "@/lib/marketing/platform-whatsapp";
import { videoWhatsappUrl } from "@/lib/marketing/video-service";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const phone = await resolvePlatformWhatsappPhone();
  const response = NextResponse.redirect(videoWhatsappUrl(phone, new URL(request.url).searchParams.get("estilo")), 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
