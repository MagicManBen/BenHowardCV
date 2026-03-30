-- ============================================================
-- PART 1: DATABASE — applications table
-- ============================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ref           text not null,
  company_name  text not null default '',
  role_title    text not null default '',
  location      text not null default '',
  sector        text not null default '',
  salary        text not null default '',
  employment_type text not null default '',
  short_company_reason text not null default '',
  short_role_reason    text not null default '',
  tone_keywords        text[] not null default '{}',
  probable_priorities  text[] not null default '{}',
  advert_summary       text not null default '',
  personalised_intro   text not null default '',
  why_this_role        text not null default '',
  key_focus_areas      text[] not null default '{}',
  raw_job_advert       text not null default '',
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint applications_ref_unique unique (ref)
);

-- Index for fast public lookups by ref + published status
create index if not exists idx_applications_ref_published
  on public.applications (ref)
  where is_published = true;

-- Index for user-scoped queries
create index if not exists idx_applications_user_id
  on public.applications (user_id);

-- Auto-update updated_at on row changes
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_applications_updated_at on public.applications;
create trigger trg_applications_updated_at
  before update on public.applications
  for each row
  execute function public.set_updated_at();


-- ============================================================
-- PART 2: ROW LEVEL SECURITY
-- ============================================================

alter table public.applications enable row level security;

-- Authenticated users can read only their own rows
create policy "Users can view own applications"
  on public.applications
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Authenticated users can insert rows for themselves
create policy "Users can insert own applications"
  on public.applications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Authenticated users can update only their own rows
create policy "Users can update own applications"
  on public.applications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Authenticated users can delete only their own rows
create policy "Users can delete own applications"
  on public.applications
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- No blanket public select policy.
-- Public access is handled exclusively through the get-published-application Edge Function
-- which uses the service_role key server-side to return a single published row by ref.
