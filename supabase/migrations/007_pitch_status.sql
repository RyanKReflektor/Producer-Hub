-- Add 'pitch' as a valid project status
alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('active', 'completed', 'on_hold', 'pitch'));
