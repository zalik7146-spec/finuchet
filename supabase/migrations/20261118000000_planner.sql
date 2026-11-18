begin;

create table if not exists public.planned_purchases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  ordered boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function private.valid_pickup_stops(stops jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(stops) = 'array' then
    jsonb_array_length(stops) between 1 and 40
    and not exists (
      select 1 from jsonb_array_elements(stops) as item(stop)
      where (
        jsonb_typeof(stop -> 'id') = 'string'
        and jsonb_typeof(stop -> 'place') = 'string'
        and length(btrim(stop ->> 'place')) between 1 and 160
        and jsonb_typeof(stop -> 'address') = 'string'
        and length(stop ->> 'address') <= 300
        and jsonb_typeof(stop -> 'details') = 'string'
        and length(stop ->> 'details') <= 600
      ) is not true
    )
  else false
  end;
$$;

revoke all on function private.valid_pickup_stops(jsonb) from public, anon;
grant execute on function private.valid_pickup_stops(jsonb) to authenticated;

create table if not exists public.pickup_trips (
  id uuid primary key default gen_random_uuid(),
  revision uuid not null default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  date date,
  stops jsonb not null check (private.valid_pickup_stops(stops)),
  created_at timestamptz not null default now()
);

alter table public.planned_purchases enable row level security;
alter table public.pickup_trips enable row level security;

drop policy if exists planned_purchases_members on public.planned_purchases;
create policy planned_purchases_members on public.planned_purchases
  for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));

drop policy if exists pickup_trips_members on public.pickup_trips;
create policy pickup_trips_members on public.pickup_trips
  for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));

revoke all on public.planned_purchases, public.pickup_trips from anon;
grant select, insert, update, delete on public.planned_purchases, public.pickup_trips to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planned_purchases') then
    alter publication supabase_realtime add table public.planned_purchases;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_trips') then
    alter publication supabase_realtime add table public.pickup_trips;
  end if;
end;
$$;

commit;
