import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("atomically records lead consent and cancels unsent contacts only, preserving appointments and other companies",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table organizations(id uuid primary key);
      create table leads(id uuid primary key,organization_id uuid,status text default 'active',metadata jsonb default '{}');
      create table automation_lead_profiles(organization_id uuid,lead_id uuid,preferences jsonb,evidence jsonb default '{}',updated_at timestamptz,primary key(organization_id,lead_id));
      create table automation_dispatches(id uuid primary key,organization_id uuid,lead_id uuid,status text,reason text,lease_until timestamptz,updated_at timestamptz);
      create table customer_agenda_bookings(id uuid primary key,organization_id uuid,lead_id uuid,status text);
      create table customer_agenda_notices(id uuid primary key,organization_id uuid,booking_id uuid,audience text,status text,reason text,lease_until timestamptz,updated_at timestamptz);
      create table custom_software_requests(id uuid primary key,organization_id uuid,lead_id uuid,status text);
      create table custom_software_meeting_notices(id uuid primary key,request_id uuid,state text,error_code text,updated_at timestamptz);
      create table customer_lead_visits(id uuid primary key,organization_id uuid,lead_id uuid,return_status text);`);
    await db.exec(readFileSync("supabase/migrations/0123_lead_contact_opt_out.sql","utf8"));
    const org=randomUUID(), foreign=randomUUID(), lead=randomUUID(), other=randomUUID(), booking=randomUUID(), request=randomUUID();
    await db.query<Record<string,unknown>>("insert into organizations values($1),($2)",[org,foreign]);
    await db.query<Record<string,unknown>>("insert into leads(id,organization_id,metadata) values($1,$2,'{\"checkout\":\"keep\"}'),($3,$4,'{}')",[lead,org,other,foreign]);
    await db.query<Record<string,unknown>>("insert into customer_agenda_bookings values($1,$2,$3,'booked')",[booking,org,lead]);
    await db.query<Record<string,unknown>>("insert into custom_software_requests values($1,$2,$3,'booked')",[request,org,lead]);
    await db.query<Record<string,unknown>>("insert into automation_lead_profiles(organization_id,lead_id,preferences,evidence) values($1,$2,'{\"windowStart\":\"10:00\"}','{\"keep\":true}')",[org,lead]);
    const statuses=["pending","processing","failed","sending","sent","uncertain"];
    for(const status of statuses){
      await db.query<Record<string,unknown>>("insert into automation_dispatches(id,organization_id,lead_id,status) values($1,$2,$3,$4)",[randomUUID(),org,lead,status]);
      for(const audience of ["lead","responsible"])await db.query<Record<string,unknown>>("insert into customer_agenda_notices(id,organization_id,booking_id,audience,status) values($1,$2,$3,$4,$5)",[randomUUID(),org,booking,audience,status]);
    }
    for(const state of ["pending","claimed","dispatching","sent","uncertain"])await db.query<Record<string,unknown>>("insert into custom_software_meeting_notices(id,request_id,state) values($1,$2,$3)",[randomUUID(),request,state]);
    for(const state of ["pending","scheduled","completed"])await db.query<Record<string,unknown>>("insert into customer_lead_visits values($1,$2,$3,$4)",[randomUUID(),org,lead,state]);
    await db.query<Record<string,unknown>>("insert into automation_dispatches(id,organization_id,lead_id,status) values($1,$2,$3,'pending')",[randomUUID(),foreign,other]);
    const initial=(await db.query<{result:{public_key:string;enabled:boolean}}>("select ensure_lead_contact_link($1,$2) result",[org,lead])).rows[0].result;
    expect(initial.enabled).toBe(true);
    expect((await db.query<Record<string,unknown>>("select opt_out_lead_contact($1,$2,'public_link') result",[foreign,lead])).rows[0]).toEqual({result:false});
    await db.query<Record<string,unknown>>("select opt_out_lead_contact($1,$2,'public_link')",[org,lead]);
    const record=(await db.query<{metadata:{opt_out:{requested_at:string;source:string};whatsapp_opt_out:boolean;checkout:string};status:string}>("select metadata,status from leads where id=$1",[lead])).rows[0];
    expect(record.status).toBe("active");expect(record.metadata).toMatchObject({whatsapp_opt_out:true,checkout:"keep",opt_out:{source:"public_link"}});
    expect(Date.parse(record.metadata.opt_out.requested_at)).not.toBeNaN();
    await db.query<Record<string,unknown>>("select opt_out_lead_contact($1,$2,'whatsapp_agent')",[org,lead]);
    expect((await db.query<Record<string,unknown>>("select metadata from leads where id=$1",[lead])).rows[0].metadata).toEqual(record.metadata);
    expect((await db.query<Record<string,unknown>>("select ensure_lead_contact_link($1,$2) result",[org,lead])).rows[0].result).toEqual({...initial,enabled:false});
    expect((await db.query<Record<string,unknown>>("select get_lead_contact_link($1) result",[initial.public_key])).rows[0].result).toEqual({...initial,enabled:false});
    const profile=(await db.query<Record<string,unknown>>("select preferences,evidence from automation_lead_profiles where lead_id=$1",[lead])).rows[0];
    expect(profile).toEqual({preferences:{windowStart:"10:00",paused:true},evidence:{keep:true}});
    expect((await db.query<Record<string,unknown>>("select status from automation_dispatches where lead_id=$1 order by status",[lead])).rows.map(r=>r.status)).toEqual(["sending","sent","skipped","skipped","skipped","uncertain"]);
    expect((await db.query<Record<string,unknown>>("select status from customer_agenda_notices where audience='lead' order by status")).rows.map(r=>r.status)).toEqual(["sending","sent","skipped","skipped","skipped","uncertain"]);
    expect((await db.query<Record<string,unknown>>("select status from customer_agenda_notices where audience='responsible' order by status")).rows.map(r=>r.status)).toEqual([...statuses].sort());
    expect((await db.query<Record<string,unknown>>("select state from custom_software_meeting_notices order by state")).rows.map(r=>r.state)).toEqual(["cancelled","cancelled","dispatching","sent","uncertain"]);
    expect((await db.query<Record<string,unknown>>("select return_status from customer_lead_visits order by return_status")).rows.map(r=>r.return_status)).toEqual(["cancelled","cancelled","completed"]);
    expect((await db.query<Record<string,unknown>>("select status from automation_dispatches where lead_id=$1",[other])).rows[0]).toEqual({status:"pending"});
    expect((await db.query<Record<string,unknown>>("select status from customer_agenda_bookings")).rows[0]).toEqual({status:"booked"});
    expect((await db.query<Record<string,unknown>>("select status from custom_software_requests")).rows[0]).toEqual({status:"booked"});
    await expect(db.query<Record<string,unknown>>("select ensure_lead_contact_link($1,$2)",[foreign,lead])).rejects.toThrow("LEAD_SCOPE");
    expect((await db.query<Record<string,unknown>>("select has_table_privilege('anon','lead_contact_links','SELECT') readable,has_function_privilege('authenticated','opt_out_lead_contact(uuid,uuid,text)','EXECUTE') callable")).rows[0]).toEqual({readable:false,callable:false});
    // Existing integrations setting the old flag also cancel their lead's queued contacts.
    await db.query<Record<string,unknown>>("update leads set metadata='{\"whatsapp_opt_out\":true}' where id=$1",[other]);
    expect((await db.query<Record<string,unknown>>("select status from automation_dispatches where lead_id=$1",[other])).rows[0]).toEqual({status:"skipped"});
    await db.query("update leads set metadata='{\"whatsapp_opt_out\":true,\"opt_out\":null}' where id=$1",[other]);
    await db.query("select opt_out_lead_contact($1,$2,'whatsapp_agent')",[foreign,other]);
    expect((await db.query("select metadata from leads where id=$1",[other])).rows[0]).toMatchObject({metadata:{opt_out:{source:"whatsapp_agent",requested_at:expect.any(String)}}});
  } finally {await db.close();}
},30000);
