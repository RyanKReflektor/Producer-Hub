-- ============================================================
-- Job titles / roles for resourcing (search + sort)
-- ============================================================
-- A human job title ("Designer", "Developer", "Project Manager") distinct
-- from the auth role (producer/contributor). Used to label, search, and
-- sort people on the resourcing timeline.

alter table public.profiles add column if not exists title text;
alter table public.resource_people add column if not exists title text;
