import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { CustomContractEditor } from "@/components/connectyhub-os/custom-contract-editor";
export const dynamic="force-dynamic";
export const metadata={title:"Contratos personalizados | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{organizationId?:string}>}){const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)return <AccessDenied/>;const result=await createServiceClient().from("organizations").select("id,name").is("billing_organization_id",null).neq("plan_code","internal").order("name").limit(1000);if(result.error)throw new Error("Não foi possível listar os clientes.");return <ConnectyShell mode="admin" activeHref="/admin/contratos" isPlatformAdmin><CustomContractEditor organizations={result.data??[]} initialOrganizationId={(await searchParams).organizationId}/></ConnectyShell>;}
