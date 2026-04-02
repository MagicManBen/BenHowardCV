create extension if not exists pgcrypto;

create table if not exists public.applications (
  ref text primary key,
  company_name text not null default '',
  role_title text not null default '',
  location text not null default '',
  short_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  application jsonb not null default '{}'::jsonb
);

alter table public.applications enable row level security;

drop policy if exists "Public read applications" on public.applications;
create policy "Public read applications"
on public.applications
for select
using (true);

create or replace function public.set_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at
before update on public.applications
for each row execute function public.set_applications_updated_at();

insert into storage.buckets (id, name, public)
values ('cv-files', 'cv-files', true)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;
