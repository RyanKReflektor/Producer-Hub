-- Project links table
create table if not exists project_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  tool        text not null check (tool in ('slack', 'notion', 'drive', 'other')),
  label       text not null,
  url         text not null,
  added_by    uuid not null references auth.users(id),
  added_at    timestamptz not null default now()
);

alter table project_links enable row level security;

-- Contributors: read links for projects they are assigned to
create policy "contributors_select_project_links" on project_links
  for select using (
    auth.uid() in (
      select person_id from project_assignments
      where project_id = project_links.project_id
    )
  );

-- Producers: read all links
create policy "producers_select_project_links" on project_links
  for select using (
    auth.uid() in (
      select id from profiles where role = 'producer'
    )
  );

-- Producers only: insert
create policy "producers_insert_project_links" on project_links
  for insert with check (
    auth.uid() in (
      select id from profiles where role = 'producer'
    )
  );

-- Producers only: update
create policy "producers_update_project_links" on project_links
  for update using (
    auth.uid() in (
      select id from profiles where role = 'producer'
    )
  );

-- Producers only: delete
create policy "producers_delete_project_links" on project_links
  for delete using (
    auth.uid() in (
      select id from profiles where role = 'producer'
    )
  );
