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
  source_type text not null check (source_type in ('pdf', 'image', 'text', 'excel', 'manual')),
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

-- Справочник товаров и позиции документов
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit text not null check (unit in ('кг', 'л', 'шт', 'м', 'уп')),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 50),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index products_name_unique on public.products (lower(btrim(name)));
create index products_created_by_idx on public.products (created_by);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  position int not null default 0,
  raw_name text not null check (char_length(raw_name) between 1 and 300),
  product_id uuid references public.products (id) on delete restrict,
  doc_quantity numeric(14, 3) check (doc_quantity > 0),
  doc_unit text not null default '' check (char_length(doc_unit) <= 20),
  base_quantity numeric(14, 3) check (base_quantity > 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index expense_items_expense_idx on public.expense_items (expense_id);
create index expense_items_product_idx on public.expense_items (product_id);

alter table public.products enable row level security;
alter table public.expense_items enable row level security;

create policy "products: участники читают" on public.products
  for select to authenticated using ((select private.is_member()));
create policy "products: участники создают" on public.products
  for insert to authenticated with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "products: участники изменяют" on public.products
  for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "products: участники удаляют" on public.products
  for delete to authenticated using ((select private.is_member()));

create policy "expense_items: участники читают" on public.expense_items
  for select to authenticated using ((select private.is_member()));
create policy "expense_items: участники создают" on public.expense_items
  for insert to authenticated with check ((select private.is_member()));
create policy "expense_items: участники изменяют" on public.expense_items
  for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "expense_items: участники удаляют" on public.expense_items
  for delete to authenticated using ((select private.is_member()));

revoke all on public.products, public.expense_items from anon;
grant select, insert, update, delete on public.products, public.expense_items to authenticated;
alter publication supabase_realtime add table public.products, public.expense_items;

-- Объединение двух товаров одной транзакцией: позиции и алиасы переходят в into_id, from_id удаляется.
create function public.merge_products(from_id uuid, into_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  from_row public.products;
begin
  if from_id = into_id then
    raise exception 'Нельзя объединить товар сам с собой';
  end if;
  select * into from_row from public.products where id = from_id;
  if not found then
    raise exception 'Товар не найден';
  end if;
  update public.expense_items set product_id = into_id where product_id = from_id;
  update public.products p
     set aliases = (
       select coalesce(array_agg(distinct a), '{}')
       from unnest(p.aliases || from_row.aliases || array[from_row.name]) as a
       where a is not null and btrim(a) <> '' and lower(btrim(a)) <> lower(btrim(p.name))
     )
   where p.id = into_id;
  delete from public.products where id = from_id;
end;
$$;

-- Замена позиций расхода целиком одной транзакцией.
create function public.replace_expense_items(target_expense uuid, lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.expense_items where expense_id = target_expense;
  insert into public.expense_items (expense_id, position, raw_name, product_id, doc_quantity, doc_unit, base_quantity, line_total)
  select target_expense,
         coalesce((l ->> 'position')::int, 0),
         l ->> 'raw_name',
         nullif(l ->> 'product_id', '')::uuid,
         (l ->> 'doc_quantity')::numeric,
         coalesce(l ->> 'doc_unit', ''),
         (l ->> 'base_quantity')::numeric,
         (l ->> 'line_total')::numeric
    from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) as l;
end;
$$;

revoke all on function public.merge_products(uuid, uuid) from public, anon;
revoke all on function public.replace_expense_items(uuid, jsonb) from public, anon;
grant execute on function public.merge_products(uuid, uuid) to authenticated;
grant execute on function public.replace_expense_items(uuid, jsonb) to authenticated;
