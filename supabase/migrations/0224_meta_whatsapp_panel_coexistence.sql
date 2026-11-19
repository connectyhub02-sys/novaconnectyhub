-- Panel signup of a number already used in the WhatsApp Business app (coexistence).
-- The attempt keeps the mode chosen at start; the connection records what Meta confirmed.
alter table public.meta_whatsapp_oauth_attempts
 add column mode text not null default 'cloud' check (mode in ('cloud','coexistence'));

alter table public.meta_whatsapp_connections
 add column coexistence boolean not null default false,
 add column coexistence_linked_at timestamptz,
 add column history_sync_state text check (history_sync_state in ('requesting','requested','uncertain','completed','declined')),
 add column contacts_sync_state text check (contacts_sync_state in ('requesting','requested','uncertain','received'));

-- Privileges are inherited from 0189: service_role only, no anon/authenticated access.
