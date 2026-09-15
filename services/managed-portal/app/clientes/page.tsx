import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {managedSession,ManagedError,unwrap} from '@/lib/managed-projects/server';
import {createServiceClient} from '@portal/lib/service';
import {Clients} from '@portal/components/clients';
export const dynamic='force-dynamic';
export default async function Page(){let session;try{session=await managedSession();}catch(e){if(e instanceof ManagedError&&e.status===401)redirect('/login');throw e;}if(!session.admin)notFound();const companies=unwrap(await session.db.rpc('managed_companies'))??[];const {data,error}=await createServiceClient().auth.admin.listUsers({page:1,perPage:200});if(error)throw Error('Não foi possível consultar os acessos.');return <main className="portal-shell"><nav><Link href="/infraestrutura">Projetos</Link><Link href="/conta">Minha conta</Link></nav><span className="portal-badge">ADMINISTRAÇÃO DE INFRAESTRUTURA</span><h1>Clientes e acessos</h1><p>Contas exclusivas desta homologação. Nenhum cliente ou banco da plataforma principal é importado automaticamente.</p><Clients companies={companies} users={data.users.map(u=>({id:u.id,email:u.email}))}/><p>Até 200 contas por consulta nesta etapa.</p></main>;}
