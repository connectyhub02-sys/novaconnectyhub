-- Status mais pessoal nas campanhas de tráfego: público (todos, interessados nos produtos, clientes que já
-- compraram, leads quentes), formato (post único ou sequência de 3 status: foto, benefício e oferta) e a cor de
-- fundo dos status em texto.
alter table public.whatsapp_traffic_campaigns
  add column if not exists status_audience text not null default 'all' check (status_audience in ('all','interested','customers','hot')),
  add column if not exists status_style text not null default 'single' check (status_style in ('single','story')),
  add column if not exists status_color smallint check (status_color is null or status_color between 1 and 19);

notify pgrst, 'reload schema';
