import { connection } from "next/server";
import { CampaignConsole } from "@/components/commerce/campaign-console";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
export const metadata = { title: "Campanhas comerciais | ConnectyHub" };
export default async function Page() {
  await connection();
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied />;
  return <CampaignConsole owner="platform" />;
}
