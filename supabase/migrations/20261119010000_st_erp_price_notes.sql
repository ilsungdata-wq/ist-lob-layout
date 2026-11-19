create table public.st_erp_price_notes (
 parent_code text not null, change_date date not null, net_price numeric not null,
 reason text not null default '', voc_code text not null default '', voc_url text not null default '',
 updated_at timestamptz not null default now(), primary key(parent_code,change_date,net_price)
);
alter table public.st_erp_price_notes enable row level security;
revoke all on public.st_erp_price_notes from anon,authenticated;
grant select,insert,update on public.st_erp_price_notes to authenticated;
create policy st_erp_notes_admin on public.st_erp_price_notes to authenticated using((select public.is_admin())) with check((select public.is_admin()));
