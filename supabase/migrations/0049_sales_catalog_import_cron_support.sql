-- Sales catalog AI importer cron support.
-- The importer stores uploaded source metadata before background processing.

alter table public.sales_catalog_import_sources
  add column if not exists file_size bigint;
