-- Fix: contributor projects RLS used a subquery on project_assignments which itself
-- has RLS applied, causing silent null returns in PostgREST joins.
-- Replace with a security definer function to safely check assignment without
-- triggering nested RLS evaluation.

create or replace function public.contributor_is_assigned_to_project(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_assignments
    where project_id = p_project_id and person_id = auth.uid()
  );
$$ language sql security definer stable;

-- Drop old policy and replace with one that uses the security definer helper
drop policy if exists "contributors_view_assigned_projects" on public.projects;

create policy "contributors_view_assigned_projects" on public.projects
  for select using (
    public.get_user_role() = 'contributor' and
    public.contributor_is_assigned_to_project(id)
  );
