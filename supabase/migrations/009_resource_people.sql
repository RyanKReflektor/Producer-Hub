-- ============================================================
-- Placeholder / vendor people for resourcing
-- ============================================================
-- Real team members live in `profiles` (they have auth accounts).
-- Placeholders (unfilled roles) and external vendors don't log in, so
-- they can't be profiles. This table holds those non-auth resourcing
-- people. Allocations and time off can reference EITHER a profile OR a
-- resource_person (exactly one).

create table if not exists public.resource_people (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  kind text not null check (kind in ('placeholder', 'vendor')),
  color text,
  daily_hours numeric(4,2) not null default 8,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.resource_people enable row level security;

drop policy if exists "producers_manage_resource_people" on public.resource_people;
create policy "producers_manage_resource_people" on public.resource_people
  for all using (public.get_user_role() = 'producer');

-- Allow allocations / time off to target a resource_person instead of a profile.
alter table public.resource_allocations
  add column if not exists resource_person_id uuid references public.resource_people(id) on delete cascade;
alter table public.resource_allocations
  alter column person_id drop not null;

alter table public.time_off
  add column if not exists resource_person_id uuid references public.resource_people(id) on delete cascade;
alter table public.time_off
  alter column person_id drop not null;

-- Exactly one owner must be set on each row.
alter table public.resource_allocations
  drop constraint if exists resource_allocations_owner_check;
alter table public.resource_allocations
  add constraint resource_allocations_owner_check
  check ((person_id is not null) <> (resource_person_id is not null));

alter table public.time_off
  drop constraint if exists time_off_owner_check;
alter table public.time_off
  add constraint time_off_owner_check
  check ((person_id is not null) <> (resource_person_id is not null));
