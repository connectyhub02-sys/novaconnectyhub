import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPublicCommerceAvailable } from "@/lib/sales-catalog/public-commerce-access";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organization_id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) return Response.json({available:false},{status:400});
  return Response.json({available:await isPublicCommerceAvailable(organizationId,createServiceClient())},{headers:{"Cache-Control":"private, no-store"}});
}
