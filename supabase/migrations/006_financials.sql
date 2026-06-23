-- Add estimated_hours to project_assignments
alter table public.project_assignments
  add column if not exists estimated_hours numeric(8,2);

-- Create expenses table
create table if not exists public.expenses (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  expense_type text not null check (expense_type in (
    'hosting', 'travel', 'accommodation', 'per_diem',
    'freelancer_flat', 'software', 'purchase', 'other'
  )),
  label text not null,
  amount numeric(12,2) not null,
  quantity numeric(10,2) not null default 1,
  notes text,
  added_by uuid references public.profiles(id),
  added_at timestamptz default now()
);

alter table public.expenses enable row level security;

-- Producers: full access
drop policy if exists "producers_full_expenses" on public.expenses;
create policy "producers_full_expenses" on public.expenses
  for all using (get_user_role() = 'producer');

-- Contributors: row-level read for assigned projects only
-- (column-level filtering of amount is handled in server code)
drop policy if exists "contributors_read_expenses" on public.expenses;
create policy "contributors_read_expenses" on public.expenses
  for select using (
    get_user_role() = 'contributor'
    and auth.uid() in (
      select person_id from public.project_assignments
      where project_id = expenses.project_id
    )
  );
