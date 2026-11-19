import { NextResponse } from "next/server";
import { resolvePlatformWhatsappPhone } from "@/lib/marketing/platform-whatsapp";

export const dynamic = "force-dynamic";

const homeMessage = "Olá ConnectyHub";

export async function GET() {
  const phone = await resolvePlatformWhatsappPhone();
  const response = NextResponse.redirect(`https://wa.me/${phone}?text=${encodeURIComponent(homeMessage)}`, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
