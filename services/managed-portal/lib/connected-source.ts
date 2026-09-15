import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {id,ManagedError,requireInfrastructure,unwrap} from '@/lib/managed-projects/server';
export type SourceRow=Record<string,string|number|boolean|null>;
export type SourceSnapshot={
 version:number;collected_at:string;organization:SourceRow;
 database:{name:string;bytes:string;table_count:number;tables:SourceRow[]};
 counts:Record<string,number>;wallet:SourceRow|null;consumption:SourceRow[];files:SourceRow[];
 storage_accounting:SourceRow|null;buckets:SourceRow[];resources:SourceRow[];agents:SourceRow[];
 inngest?:{status:'ok'|'failed';collected_at?:string;attempted_at?:string;app_id?:string;app_name?:string;function_count?:number;functions?:SourceRow[];runs?:SourceRow[];failures?:SourceRow[];has_more_runs?:boolean;has_more_failures?:boolean;window_hours?:number};
};
export type SourceConnection={project_id:string;source_key:string;source_organization_id:string;source_name:string;collected_at:string|null;attempted_at:string|null;collection_status:'pending'|'ok'|'failed';snapshot:SourceSnapshot|null};
export async function connectedSource(db:SupabaseClient,admin:boolean,projectId:string):Promise<SourceConnection>{
 requireInfrastructure(admin);
 const data=unwrap(await db.from('portal_source_connections').select('project_id,source_key,source_organization_id,source_name,collected_at,attempted_at,collection_status,snapshot').eq('project_id',id(projectId)).maybeSingle());
 if(!data)throw new ManagedError(404,'Projeto conectado não encontrado.');
 return data as SourceConnection;
}
