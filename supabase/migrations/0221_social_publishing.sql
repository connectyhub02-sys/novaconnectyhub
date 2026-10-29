-- One immutable approved publication, independently recoverable deliveries.
create table public.social_posts (
 id uuid primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null, revision integer not null default 1,
 draft jsonb not null, state text not null default 'draft' check(state in ('draft','approved','cancelled')),
 scheduled_for timestamptz, timezone text not null default 'America/Sao_Paulo',
 approved_at timestamptz, approved_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create table public.social_deliveries (
 id uuid primary key default gen_random_uuid(), post_id uuid not null, organization_id uuid not null,
 target text not null check(target in ('facebook','instagram','youtube','tiktok')),
 account_id text not null, connection_id uuid, status text not null default 'queued'
 check(status in ('queued','processing','published','failed','uncertain','cancelled')),
 progress jsonb not null default '{}', result_url text, provider_id text, error_message text,
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(post_id,organization_id) references public.social_posts(id,organization_id) on delete cascade,
 unique(post_id,target)
);
create index social_delivery_due on public.social_deliveries(next_attempt_at) where status in ('queued','processing');
create index social_posts_org on public.social_posts(organization_id,created_at desc);
alter table public.social_posts enable row level security;
alter table public.social_deliveries enable row level security;
revoke all on public.social_posts,public.social_deliveries from anon,authenticated;
grant all on public.social_posts,public.social_deliveries to service_role;

create function public.approve_social_post(p_org uuid,p_id uuid,p_revision integer,p_actor uuid,p_deliveries jsonb,p_when timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare p public.social_posts;
begin
 select * into p from public.social_posts where id=p_id and organization_id=p_org for update;
 if p.id is null or p.state<>'draft' or p.revision<>p_revision then raise exception 'Publication changed; reload'; end if;
 if jsonb_typeof(p_deliveries)<>'array' or jsonb_array_length(p_deliveries) not between 1 and 4 then raise exception 'Invalid deliveries'; end if;
 update public.social_posts set state='approved',approved_at=now(),approved_by=p_actor,scheduled_for=p_when,updated_at=now() where id=p_id;
 insert into public.social_deliveries(post_id,organization_id,target,account_id,connection_id,next_attempt_at)
 select p_id,p_org,e->>'target',e->>'accountId',nullif(e->>'connectionId','')::uuid,coalesce(p_when,now()) from jsonb_array_elements(p_deliveries) e;
end $$;

create function public.claim_social_deliveries(p_limit integer default 4)
returns setof public.social_deliveries language sql security definer set search_path=public as $$
 update public.social_deliveries d set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes',status='processing',attempts=attempts+1,updated_at=now()
 where id in (select x.id from public.social_deliveries x join public.social_posts p on p.id=x.post_id
 where x.status in ('queued','processing') and p.state='approved' and x.next_attempt_at<=now()
 and (x.lease_until is null or x.lease_until<now()) order by x.next_attempt_at for update of x,p skip locked limit least(greatest(p_limit,1),8)) returning d.*;
$$;
create function public.cancel_social_post(p_org uuid,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.social_posts where id=p_id and organization_id=p_org for update;
 if exists(select 1 from public.social_deliveries where post_id=p_id and organization_id=p_org and (status in ('processing','uncertain') or lease_until>now())) then
 raise exception 'A delivery is already processing; cancellation is unavailable'; end if;
 if exists(select 1 from public.social_posts where id=p_id and organization_id=p_org and state='approved') and
 not exists(select 1 from public.social_deliveries where post_id=p_id and organization_id=p_org and status in ('queued','failed')) then return; end if;
 update public.social_posts set state='cancelled',updated_at=now() where id=p_id and organization_id=p_org;
 update public.social_deliveries set status='cancelled',updated_at=now() where post_id=p_id and organization_id=p_org and status in ('queued','failed');
end $$;
revoke all on function public.approve_social_post(uuid,uuid,integer,uuid,jsonb,timestamptz),public.claim_social_deliveries(integer),public.cancel_social_post(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_social_post(uuid,uuid,integer,uuid,jsonb,timestamptz),public.claim_social_deliveries(integer),public.cancel_social_post(uuid,uuid) to service_role;

create function public.retry_social_delivery(p_org uuid,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare parent uuid;
begin
 select post_id into parent from public.social_deliveries where id=p_id and organization_id=p_org;
 perform 1 from public.social_posts where id=parent and organization_id=p_org and state='approved' for update;
 if not found then raise exception 'Publication is not approved'; end if;
 update public.social_deliveries set status='queued',error_message=null,lease_id=null,lease_until=null,attempts=0,next_attempt_at=now(),updated_at=now()
 where id=p_id and organization_id=p_org and status='failed';
 if not found then raise exception 'Only confirmed failures can be retried'; end if;
end $$;
revoke all on function public.retry_social_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_social_delivery(uuid,uuid) to service_role;
