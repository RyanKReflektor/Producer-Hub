-- The contributors_view_assigned_projects policy on projects uses an EXISTS
-- subquery on project_assignments. Because project_assignments also has RLS
-- enabled, Postgres applies those policies inside the subquery too, causing
-- the cross-table RLS evaluation to silently block the row.
--
-- Fix: wrap the assignment check in a security definer function so it runs
-- as the function owner (bypassing project_assignments RLS) while still
-- correctly checking auth.uid().

create or replace function public.contributor_is_assigned_to_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.project_assignments
    where project_id = p_project_id
      and person_id = auth.uid()
  );
$$;

-- Re-create the projects policy using the helper
drop policy if exists "contributors_view_assigned_projects" on public.projects;

create policy "contributors_view_assigned_projects" on public.projects
  for select
  using (
    public.get_user_role() = 'contributor'
    and public.contributor_is_assigned_to_project(id)
  );
