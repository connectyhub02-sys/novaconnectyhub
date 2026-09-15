import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {configuration} from './config';
export function createServiceClient(){const c=configuration(),key=process.env.PORTAL_SERVICE_KEY;if(!key)throw Error('Service unavailable');return createClient(c.url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
