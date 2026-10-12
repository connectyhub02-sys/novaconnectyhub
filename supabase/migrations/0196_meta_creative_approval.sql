-- Approval is of a saved proposal only. It never authorizes dispatch or ad spend.
alter table public.meta_creative_jobs add column proposal_approval jsonb;
alter table public.meta_creative_jobs add constraint meta_creative_approval_completed
 check (proposal_approval is null or (status = 'completed' and mode = 'campaign' and result is not null));
create function public.invalidate_meta_creative_approval() returns trigger
language plpgsql set search_path = public as $$
begin
 if new.brief is distinct from old.brief or new.result is distinct from old.result
    or new.status is distinct from old.status then
   new.proposal_approval := null;
 end if;
 return new;
end;
$$;
create trigger meta_creative_approval_revision before update on public.meta_creative_jobs
for each row execute function public.invalidate_meta_creative_approval();
