-- Add producer_only flag to project_links
alter table project_links add column if not exists producer_only boolean not null default false;

-- Update contributor select policy to exclude producer-only links
drop policy if exists "contributors_select_project_links" on project_links;

create policy "contributors_select_project_links" on project_links
  for select using (
    producer_only = false
    and auth.uid() in (
      select person_id from project_assignments
      where project_id = project_links.project_id
    )
  );
