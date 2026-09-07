import { campaignAdminHandlers } from "@/lib/commerce/campaign-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = campaignAdminHandlers("store");
