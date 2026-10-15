import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";

it("edits carousel routines and replaces only their scheduled posts atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table whatsapp_traffic_campaigns(
      id text primary key, organization_id text, post_status boolean, target_ids text[], product_mode text,
      catalog_item_ids text[], idea text, manual_text text, post_format text, intensity text, start_hour int,
      schedule_mode text, starts_at timestamptz, status_audience text, status_style text, status_color int,
      planned_until timestamptz, last_error text, last_run_at timestamptz);
      create table content_pipeline_items(id text primary key, organization_id text, status text, tags text[], updated_at timestamptz);
      insert into whatsapp_traffic_campaigns(id,organization_id,post_format,planned_until) values('routine','org','auto',now());
      insert into content_pipeline_items values
        ('pending','org','scheduled',array['traffic_campaign:routine'],now()),
        ('sent','org','published',array['traffic_campaign:routine'],now()),
        ('other-routine','org','scheduled',array['traffic_campaign:another'],now()),
        ('other-org','another','scheduled',array['traffic_campaign:routine'],now());`);
    await db.exec(readFileSync("supabase/migrations/0205_traffic_explicit_carousel.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/0206_traffic_carousel_size_audio.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/0207_traffic_fixed_daily_times.sql", "utf8"));
    expect((await db.query("select daily_times from whatsapp_traffic_campaigns")).rows).toEqual([{ daily_times: null }]);
    expect((await db.query("select carousel_size,include_audio from whatsapp_traffic_campaigns")).rows).toEqual([{carousel_size:null,include_audio:false}]);
    await db.exec("update whatsapp_traffic_campaigns set last_run_at=now()");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"scheduled"}]);
    for (const value of ["array[]::text[]", "array['09:00','09:00']", "array['24:00']", "array[null]::text[]", "array['01:00','02:00','03:00','04:00','05:00','06:00']"]) {
      await expect(db.exec(`update whatsapp_traffic_campaigns set daily_times=${value}`)).rejects.toThrow();
    }
    await db.exec("begin; update whatsapp_traffic_campaigns set daily_times=array['09:00','14:00','18:00']; rollback;");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"scheduled"}]);
    await db.exec("update whatsapp_traffic_campaigns set daily_times=array['09:00','14:00','18:00']");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"archived"}]);
    await db.exec("update content_pipeline_items set status='scheduled' where id='pending'");
    await db.exec("begin; update whatsapp_traffic_campaigns set carousel_size=3,include_audio=true; rollback;");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"scheduled"}]);
    await expect(db.exec("update whatsapp_traffic_campaigns set carousel_size=1")).rejects.toThrow();
    await db.exec("begin; update whatsapp_traffic_campaigns set post_format='carousel'; rollback;");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"scheduled"}]);
    await db.exec("update whatsapp_traffic_campaigns set carousel_size=3,include_audio=true");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"archived"}]);
    await expect(db.exec("update whatsapp_traffic_campaigns set post_format='invalid'")).rejects.toThrow();
    await db.exec("update whatsapp_traffic_campaigns set post_format='carousel'");
    expect((await db.query("select post_format,planned_until from whatsapp_traffic_campaigns")).rows).toEqual([{post_format:"carousel",planned_until:null}]);
    expect((await db.query("select id,status from content_pipeline_items order by id")).rows).toEqual([
      {id:"other-org",status:"scheduled"},{id:"other-routine",status:"scheduled"},{id:"pending",status:"archived"},{id:"sent",status:"published"},
    ]);
    await db.exec("update content_pipeline_items set status='scheduled' where id='pending'; update whatsapp_traffic_campaigns set planned_until=now()");
    expect((await db.query("select status from content_pipeline_items where id='pending'")).rows).toEqual([{status:"scheduled"}]);
  } finally { await db.close(); }
}, 30000);
