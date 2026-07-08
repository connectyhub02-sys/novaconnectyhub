import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { PlatformProductsConsole } from "@/components/connectyhub-os/platform-products-console";
import { getAdminPlatformProductCatalog } from "@/lib/platform-products";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Produtos ConnectyHub | ConnectyHub",
  description: "Cadastro de produtos globais da ConnectyHub para marketplace e revenda por comissao.",
};

export default async function AdminProdutosConnectyHubPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const catalog = await getAdminPlatformProductCatalog(createServiceClient());

  return (
    <PlatformProductsConsole
      catalog={catalog}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
