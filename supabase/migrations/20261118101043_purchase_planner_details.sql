begin;

create function private.valid_purchase_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(tags) <= 10
    and coalesce(array_ndims(tags), 1) = 1
    and not exists (
      select 1 from unnest(tags) as entry(tag)
      where tag is null or length(tag) not between 1 and 32
        or btrim(tag) = '' or strpos(tag, ',') > 0
    );
$$;

revoke all on function private.valid_purchase_tags(text[]) from public, anon;
grant execute on function private.valid_purchase_tags(text[]) to authenticated;

alter table public.planned_purchases
  add column purchase_group text not null default '' check (length(purchase_group) <= 64),
  add column tags text[] not null default '{}' check (private.valid_purchase_tags(tags)),
  add column due_date date;

create table public.planned_purchase_comments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.planned_purchases(id) on delete cascade,
  body text not null check (length(body) <= 2000 and length(btrim(body)) > 0),
  author_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
    check (author_email <> ''),
  created_at timestamptz not null default now()
);

create index planned_purchase_comments_purchase_date_idx
  on public.planned_purchase_comments (purchase_id, created_at, id);

alter table public.planned_purchase_comments enable row level security;

create policy planned_purchase_comments_read on public.planned_purchase_comments
  for select to authenticated using ((select private.is_member()));

create policy planned_purchase_comments_add on public.planned_purchase_comments
  for insert to authenticated with check ((select private.is_member()));

revoke all on public.planned_purchase_comments from public, anon, authenticated;
grant select, insert (purchase_id, body) on public.planned_purchase_comments to authenticated;

alter publication supabase_realtime add table public.planned_purchase_comments;

commit;
