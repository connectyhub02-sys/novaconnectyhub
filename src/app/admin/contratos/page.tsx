import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { CustomContractEditor } from "@/components/connectyhub-os/custom-contract-editor";
import { getAdminPlatformUsers } from "@/lib/admin/users";
export const dynamic="force-dynamic";
export const metadata={title:"Contratos personalizados | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{organizationId?:string}>}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied/>;
  const client = createServiceClient();
  // Match the account shown in Clients. Historical organizations without an
  // actual user's primary membership must not become billing targets here.
  const {users} = await getAdminPlatformUsers(client);
  const accountUsers = users.filter(user => !user.isPlatformAdmin && user.organizationId);
  const ids = Array.from(new Set(accountUsers.map(user => user.organizationId!)));
  const memberships = ids.length ? await client.from("organizations").select("id,billing_organization_id").in("id",ids) : {data:[],error:null};
  if (memberships.error) throw new Error("Não foi possível conferir as contas de cobrança.");
  const roots = new Map((memberships.data??[]).map(org => [org.id,org.billing_organization_id??org.id]));
  const rootIds = Array.from(new Set(roots.values()));
  const result = rootIds.length ? await client.from("organizations").select("id,name").in("id",rootIds).neq("plan_code","internal").order("name") : {data:[],error:null};
  if (result.error) throw new Error("Não foi possível listar os clientes.");
  const organizations = (result.data??[]).map(org => {
    const owner = accountUsers.find(user => roots.get(user.organizationId!)===org.id && user.orgRole==="owner") ?? accountUsers.find(user => roots.get(user.organizationId!)===org.id);
    return {...org,name:owner?.email?`${org.name} · ${owner.email}`:org.name};
  });
  const requested = (await searchParams).organizationId;
  const initialOrganizationId = organizations.some(org=>org.id===requested)?requested:undefined;
  return <ConnectyShell mode="admin" activeHref="/admin/contratos" isPlatformAdmin><CustomContractEditor organizations={organizations} initialOrganizationId={initialOrganizationId}/></ConnectyShell>;
}
