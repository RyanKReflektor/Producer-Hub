-- ============================================================
-- Resourcing: allocations + time off (rebuilds Phase-2 scaffold)
-- ============================================================
-- Adapts the resourcing model from a date-range + hours-per-day
-- allocation shape (continuous timeline bars), replacing the original
-- week-bucketed scaffold from 001_initial_schema.sql.

-- Capacity + display colour on people (drives utilisation + avatar/row colour)
alter table public.profiles
  add column if not exists daily_hours numeric(4,2) not null default 8;
alter table public.profiles
  add column if not exists color text;

-- Display colour on projects (drives the allocation bar colour)
alter table public.projects
  add column if not exists color text;

-- Rebuild resource_allocations in the date-range / hours-per-day model.
-- The scaffold was week-bucketed and never wired to UI, so we drop it.
drop policy if exists "producers_manage_allocations" on public.resource_allocations;
drop policy if exists "contributors_view_own_allocations" on public.resource_allocations;
drop table if exists public.resource_allocations cascade;

create table public.resource_allocations (
  id uuid default uuid_generate_v4() primary key,
  person_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  start_date date not null,
  end_date date not null,
  hours_per_day numeric(4,2) not null default 0 check (hours_per_day >= 0 and hours_per_day <= 24),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_date >= start_date)
);

create index resource_allocations_person_idx on public.resource_allocations (person_id, start_date);
create index resource_allocations_project_idx on public.resource_allocations (project_id);

alter table public.resource_allocations enable row level security;

create policy "producers_manage_allocations" on public.resource_allocations
  for all using (public.get_user_role() = 'producer');

create policy "contributors_view_own_allocations" on public.resource_allocations
  for select using (
    public.get_user_role() = 'contributor' and person_id = auth.uid()
  );

-- Time off: vacation / holiday / sick / other
create table if not exists public.time_off (
  id uuid default uuid_generate_v4() primary key,
  person_id uuid references public.profiles(id) on delete cascade not null,
  start_date date not null,
  end_date date not null,
  type text not null check (type in ('vacation', 'holiday', 'sick', 'other')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  check (end_date >= start_date)
);

create index time_off_person_idx on public.time_off (person_id, start_date);

alter table public.time_off enable row level security;

drop policy if exists "producers_manage_time_off" on public.time_off;
create policy "producers_manage_time_off" on public.time_off
  for all using (public.get_user_role() = 'producer');

drop policy if exists "contributors_view_own_time_off" on public.time_off;
create policy "contributors_view_own_time_off" on public.time_off
  for select using (
    public.get_user_role() = 'contributor' and person_id = auth.uid()
  );
