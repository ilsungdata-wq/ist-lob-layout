create table if not exists public.st_erp_catalog_audit (
 product_code text primary key,
 current_model text,
 current_type text,
 erp_model text,
 erp_group text,
 erp_type text,
 status text not null check (status in ('match','model','type','missing')),
 checked_at timestamptz not null default now()
);
alter table public.st_erp_catalog_audit enable row level security;
revoke all on public.st_erp_catalog_audit from anon, authenticated;
grant select, insert, update on public.st_erp_catalog_audit to service_role;