import 'server-only';
import {cookies} from 'next/headers';
import {createServerClient} from '@supabase/ssr';
import {configuration} from './config';
export async function createClient(){const jar=await cookies(),c=configuration();return createServerClient(c.url,c.key,{cookieOptions:{name:'managed-portal-session',httpOnly:true,secure:c.origin.startsWith('https:'),sameSite:'lax',path:'/'},cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* Server Components refresh through proxy. */}}}});}
