-- ============================================================
-- Free-form tags for resources (skills, seniority, discipline…)
-- ============================================================
-- Unlimited, flexible labels on people — e.g. "Designer", "Dev", "Jr",
-- "Sr", "Motion". Stored as a text array; used to label and search.

alter table public.profiles add column if not exists tags text[] not null default '{}';
alter table public.resource_people add column if not exists tags text[] not null default '{}';
