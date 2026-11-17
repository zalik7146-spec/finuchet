-- ФинУчет ИИ: таблицы и политики доступа для нового проекта Supabase.
-- Один общий реестр; доступ имеют только почты из таблицы members.
-- После применения добавьте первую почту вручную:
--   insert into public.members (email) values ('you@example.com');

create table public.members (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  added_at timestamptz not null default now()
);

create table public.categories (
  id text primary key check (char_length(id) between 1 and 80),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  monthly_budget numeric(14, 2) check (monthly_budget >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'RUB' check (currency = 'RUB'),
  -- направление с заявками удалить нельзя
  category_id text not null references public.categories (id) on delete restrict,
  category_name text not null check (char_length(category_name) between 1 and 60),
  vendor text not null check (char_length(vendor) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  document_number text not null default '' check (char_length(document_number) <= 60),
  source_type text not null check (source_type in ('pdf', 'image', 'text', 'manual')),
  source_file_name text not null default '' check (char_length(source_file_name) <= 200),
  ai_confidence text not null check (ai_confidence in ('high', 'medium', 'low')),
  is_purchase boolean not null default false,
  received_at timestamptz,
  received_by_email text not null default '' check (char_length(received_by_email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_date_idx on public.expenses (date desc);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_awaiting_idx on public.expenses (date) where is_purchase and received_at is null;
create index expenses_created_by_idx on public.expenses (created_by);
create index categories_created_by_idx on public.categories (created_by);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

-- Проверка «почта из токена есть в списке участников». Схема private не видна через API.
create schema if not exists private;

create function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;

revoke all on function private.is_member() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member() to authenticated;

alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;

create policy "categories: участники читают" on public.categories
  for select to authenticated using ((select private.is_member()));
create policy "categories: участники создают" on public.categories
  for insert to authenticated with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "categories: участники изменяют" on public.categories
  for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "categories: участники удаляют" on public.categories
  for delete to authenticated using ((select private.is_member()));

create policy "expenses: участники читают" on public.expenses
  for select to authenticated using ((select private.is_member()));
create policy "expenses: участники создают" on public.expenses
  for insert to authenticated with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "expenses: участники изменяют" on public.expenses
  for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "expenses: участники удаляют" on public.expenses
  for delete to authenticated using ((select private.is_member()));

create policy "members: участники читают" on public.members
  for select to authenticated using ((select private.is_member()));
create policy "members: участники добавляют" on public.members
  for insert to authenticated with check ((select private.is_member()));
-- себя удалить нельзя: в реестре всегда остаётся хотя бы один участник
create policy "members: участники удаляют других" on public.members
  for delete to authenticated
  using ((select private.is_member()) and email <> lower(coalesce((select auth.jwt()) ->> 'email', '')));

revoke all on public.members, public.categories, public.expenses from anon;
grant select, insert, delete on public.members to authenticated;
grant select, insert, update, delete on public.categories, public.expenses to authenticated;

-- синхронизация между устройствами
alter publication supabase_realtime add table public.members, public.categories, public.expenses;

-- Пары расходов, отмеченные «Не дубль»
create table public.duplicate_dismissals (
  expense_a uuid not null references public.expenses (id) on delete cascade,
  expense_b uuid not null references public.expenses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (expense_a, expense_b),
  check (expense_a < expense_b)
);
create index duplicate_dismissals_b_idx on public.duplicate_dismissals (expense_b);

alter table public.duplicate_dismissals enable row level security;
create policy "duplicate_dismissals: участники читают" on public.duplicate_dismissals
  for select to authenticated using ((select private.is_member()));
create policy "duplicate_dismissals: участники создают" on public.duplicate_dismissals
  for insert to authenticated with check ((select private.is_member()));
create policy "duplicate_dismissals: участники удаляют" on public.duplicate_dismissals
  for delete to authenticated using ((select private.is_member()));

revoke all on public.duplicate_dismissals from anon;
grant select, insert, delete on public.duplicate_dismissals to authenticated;
alter publication supabase_realtime add table public.duplicate_dismissals;
