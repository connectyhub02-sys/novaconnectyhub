import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('node:fs/promises',()=>({readFile:vi.fn()}));
import {readFile} from 'node:fs/promises';
import {connectedFile} from '../services/managed-portal/lib/connected-files';
import type {SupabaseClient} from '@supabase/supabase-js';
const project='fdf6122a-b883-4d41-968d-71ba1d31d48a',file='3767a59b-389c-4a6c-bc0e-bfe2a4a5b321';
function db(files:unknown[]=[]){const chain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{snapshot:{files}},error:null})};return {from:vi.fn(()=>chain)} as unknown as SupabaseClient;}
describe('private connected files',()=>{
 it('denies non-admin before reading credentials or inventory',async()=>{const client=db();await expect(connectedFile(client,false,project,'lead_files',file)).rejects.toMatchObject({status:403});expect(client.from).not.toHaveBeenCalled();expect(readFile).not.toHaveBeenCalled();});
 it.each(['studio_assets','../lead_files','https://example.com'])('does not accept arbitrary file source %s',async source=>{await expect(connectedFile(db(),true,project,source,file)).rejects.toMatchObject({status:404});expect(readFile).not.toHaveBeenCalled();});
 it('denies an id outside the selected source records',async()=>{await expect(connectedFile(db(),true,project,'lead_files',file)).rejects.toMatchObject({status:404});expect(readFile).not.toHaveBeenCalled();});
 it('does not download an unresolved storage location',async()=>{await expect(connectedFile(db([{id:file,source:'lead_files',availability:'unresolved'}]),true,project,'lead_files',file)).rejects.toMatchObject({status:404});expect(readFile).not.toHaveBeenCalled();});
});
