-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('producer', 'contributor')),
  person_type text check (person_type in ('employee', 'freelancer')),
  avatar_url text,
  internal_rate numeric(10,2),  -- never exposed to contributors
  external_rate numeric(10,2),  -- optional
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Projects
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  client text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'on_hold')),
  start_date date,
  end_date date,
  budget_type text check (budget_type in ('hours', 'dollars')),
  budget_value numeric(12,2),
  currency text default 'CAD',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Project assignments (many-to-many with rate overrides)
create table public.project_assignments (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  person_id uuid references public.profiles(id) on delete cascade not null,
  internal_rate_override numeric(10,2),
  external_rate_override numeric(10,2),
  assigned_at timestamptz default now(),
  unique(project_id, person_id)
);

-- Time entries
create table public.time_entries (
  id uuid default uuid_generate_v4() primary key,
  person_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  date date not null,
  hours numeric(5,2) not null check (hours >= 0 and hours <= 24),
  description text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  week_number integer not null,
  year integer not null,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Phase 2: Resource allocations (scaffold)
create table public.resource_allocations (
  id uuid default uuid_generate_v4() primary key,
  person_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  week_number integer not null,
  year integer not null,
  planned_hours numeric(5,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(person_id, project_id, week_number, year)
);

-- Phase 2: Milestones (scaffold)
create table public.milestones (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  date date not null,
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.resource_allocations enable row level security;
alter table public.milestones enable row level security;

-- Helper function to get current user role
create or replace function public.get_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES RLS
create policy "producers_read_all_profiles" on public.profiles
  for select using (public.get_user_role() = 'producer');

create policy "contributors_read_own_profile" on public.profiles
  for select using (auth.uid() = id and public.get_user_role() = 'contributor');

create policy "producers_manage_profiles" on public.profiles
  for all using (public.get_user_role() = 'producer');

create policy "contributors_update_own_profile" on public.profiles
  for update using (auth.uid() = id and public.get_user_role() = 'contributor')
  with check (auth.uid() = id);

-- PROJECTS RLS
create policy "producers_manage_projects" on public.projects
  for all using (public.get_user_role() = 'producer');

create policy "contributors_view_assigned_projects" on public.projects
  for select using (
    public.get_user_role() = 'contributor' and
    exists (
      select 1 from public.project_assignments
      where project_id = id and person_id = auth.uid()
    )
  );

-- PROJECT ASSIGNMENTS RLS
create policy "producers_manage_assignments" on public.project_assignments
  for all using (public.get_user_role() = 'producer');

create policy "contributors_view_own_assignments" on public.project_assignments
  for select using (
    public.get_user_role() = 'contributor' and person_id = auth.uid()
  );

-- TIME ENTRIES RLS
create policy "producers_manage_all_entries" on public.time_entries
  for all using (public.get_user_role() = 'producer');

create policy "contributors_manage_own_entries" on public.time_entries
  for all using (
    public.get_user_role() = 'contributor' and person_id = auth.uid()
  );

-- RESOURCE ALLOCATIONS RLS
create policy "producers_manage_allocations" on public.resource_allocations
  for all using (public.get_user_role() = 'producer');

create policy "contributors_view_own_allocations" on public.resource_allocations
  for select using (
    public.get_user_role() = 'contributor' and person_id = auth.uid()
  );

-- MILESTONES RLS
create policy "producers_manage_milestones" on public.milestones
  for all using (public.get_user_role() = 'producer');

create policy "contributors_view_milestones" on public.milestones
  for select using (
    public.get_user_role() = 'contributor' and
    exists (
      select 1 from public.project_assignments pa
      join public.projects p on p.id = pa.project_id
      where p.id = project_id and pa.person_id = auth.uid()
    )
  );

-- Indexes
create index idx_time_entries_person on public.time_entries(person_id);
create index idx_time_entries_project on public.time_entries(project_id);
create index idx_time_entries_week on public.time_entries(year, week_number);
create index idx_time_entries_status on public.time_entries(status);
create index idx_project_assignments_person on public.project_assignments(person_id);
create index idx_project_assignments_project on public.project_assignments(project_id);

-- Updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function public.handle_updated_at();
create trigger time_entries_updated_at before update on public.time_entries
  for each row execute function public.handle_updated_at();

-- View: project burn summary (producers only via RLS on underlying tables)
create or replace view public.project_burn as
select
  te.project_id,
  te.year,
  te.week_number,
  te.person_id,
  sum(te.hours) as total_hours,
  sum(te.hours * coalesce(pa.internal_rate_override, pr.internal_rate, 0)) as internal_cost,
  sum(te.hours * coalesce(pa.external_rate_override, pr.external_rate, 0)) as external_cost
from public.time_entries te
join public.profiles pr on pr.id = te.person_id
join public.project_assignments pa on pa.project_id = te.project_id and pa.person_id = te.person_id
where te.status in ('submitted', 'approved')
group by te.project_id, te.year, te.week_number, te.person_id;
