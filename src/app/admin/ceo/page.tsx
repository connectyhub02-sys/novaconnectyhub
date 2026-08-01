import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "CEO IA | Admin OS",
};

export default async function AdminCeoPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  redirect("/admin#ceo");
}
