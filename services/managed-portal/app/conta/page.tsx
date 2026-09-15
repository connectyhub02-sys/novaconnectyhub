import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@portal/lib/server';
import {AuthForm} from '@portal/components/auth-form';
import {Logout} from '@portal/components/logout';
export const dynamic='force-dynamic';
export default async function Page(){const {data}=await (await createClient()).auth.getUser();if(!data.user)redirect('/login');return <main className="portal-shell"><nav><Link href="/infraestrutura">Projetos</Link><Link href="/clientes">Clientes e acessos</Link></nav><h1>Minha conta</h1><p>{data.user.email}</p><div style={{maxWidth:460}}><AuthForm mode="password"/><Logout/></div></main>;}
