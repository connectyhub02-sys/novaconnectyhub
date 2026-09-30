-- Enquetes de campanha em grupo: quem votou é chamado no privado pelo agente que postou a enquete,
-- citando a opção escolhida. A fila de convites do grupo passa a guardar a enquete e o voto.
alter table public.whatsapp_group_invites
  add column if not exists poll_message_id text,
  add column if not exists poll_question text check (poll_question is null or length(poll_question) <= 500),
  add column if not exists poll_option text check (poll_option is null or length(poll_option) <= 200),
  add column if not exists group_name text check (group_name is null or length(group_name) <= 200);

notify pgrst, 'reload schema';
