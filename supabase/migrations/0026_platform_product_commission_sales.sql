alter table public.platform_product_commissions
  add column if not exists order_item_id uuid references public.sales_catalog_order_items(id) on delete set null,
  add column if not exists sale_quantity integer not null default 1 check (sale_quantity > 0 and sale_quantity <= 100000);

alter table public.platform_product_commissions
  drop constraint if exists platform_product_commissions_status_check;

alter table public.platform_product_commissions
  add constraint platform_product_commissions_status_check
  check (status in ('pending', 'available', 'paid', 'cancelled', 'blocked', 'refunded'));

create unique index if not exists idx_platform_product_commissions_payment_item
  on public.platform_product_commissions (payment_session_id, order_item_id)
  where payment_session_id is not null and order_item_id is not null;

create index if not exists idx_platform_product_commissions_release
  on public.platform_product_commissions (status, release_at)
  where status in ('pending', 'available');

create index if not exists idx_platform_product_commissions_order_item
  on public.platform_product_commissions (order_item_id)
  where order_item_id is not null;
