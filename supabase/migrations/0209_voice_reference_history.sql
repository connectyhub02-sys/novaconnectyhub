begin;
-- Extend the existing private, project-scoped history; no receipts are rewritten.
create or replace view public.voice_studio_history with (security_invoker = true) as
select g.* from public.voice_generations g
left join public.studio_operations s on s.id = g.id
where g.operation = 'text_to_speech' or s.operation in ('long_tts','voice_change');
revoke all on public.voice_studio_history from public, anon, authenticated;
grant select on public.voice_studio_history to service_role;
notify pgrst, 'reload schema';
commit;
