-- =====================================================================
-- HomeStock · esquema de Supabase (PostgreSQL) con seguridad por filas
-- Ejecutar una sola vez en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hogares y miembros
-- ---------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key,
  name text not null default 'Mi casa' check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists idx_members_user on public.household_members (user_id);

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

-- ¿El usuario actual pertenece al hogar? (security definer para evitar recursión en RLS)
create or replace function public.is_member(p_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = p_household and user_id = auth.uid());
$$;

create or replace function public.is_admin(p_household uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = p_household and user_id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- Tablas de datos (espejo de la base de datos local del móvil)
-- updated_at / created_at son texto ISO generado en el dispositivo (resolución de conflictos).
-- server_updated_at lo pone el servidor y sirve de cursor de sincronización.
-- ---------------------------------------------------------------------
create or replace function public.hs_touch() returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

do $$
declare
  common text := '
    id uuid primary key,
    household_id uuid not null references public.households (id) on delete cascade,
    created_at text not null,
    updated_at text not null,
    deleted boolean not null default false,
    created_by uuid default auth.uid(),
    server_updated_at timestamptz not null default clock_timestamp()';
begin
  execute format('create table if not exists public.locations (%s,
    name text not null, icon text not null default ''cube-outline'', sort_order integer not null default 0)', common);

  execute format('create table if not exists public.products (%s,
    name text not null, brand text, barcode text, image_url text, category text, subcategory text,
    unit text not null default ''ud'', package_count double precision, package_amount double precision, package_unit text,
    packaging text, default_location_id uuid, min_quantity double precision, usual_quantity double precision,
    preferred_store text, notes text, source text not null default ''manual'')', common);

  execute format('create table if not exists public.batches (%s,
    product_id uuid not null, location_id uuid, expiry_date date, expiry_kind text check (expiry_kind in (''use_by'',''best_before'')),
    opened_at date, purchased_at date, price_paid double precision, store text)', common);

  execute format('create table if not exists public.stock_movements (%s,
    product_id uuid not null, batch_id uuid, delta double precision not null,
    reason text not null check (reason in (''purchase'',''consume'',''discard'',''expired'',''adjust'')),
    unit_price double precision, store text, author text)', common);

  execute format('create table if not exists public.shopping_lists (%s,
    name text not null, kind text not null default ''custom'', status text not null default ''active'', store text, emoji text)', common);

  execute format('create table if not exists public.list_items (%s,
    list_id uuid not null, product_id uuid, name text not null, quantity double precision not null default 1, unit text not null default ''ud'',
    category text, estimated_price double precision, checked boolean not null default false, checked_at text,
    actual_price double precision, sort_order integer not null default 0, note text)', common);

  execute format('create table if not exists public.purchases (%s,
    list_id uuid, store text, total double precision not null default 0, purchased_at date not null,
    source text not null default ''list'', item_count integer not null default 0)', common);

  execute format('create table if not exists public.purchase_items (%s,
    purchase_id uuid not null, product_id uuid, name text not null, category text, quantity double precision not null default 1,
    unit_price double precision, total_price double precision, discount double precision not null default 0)', common);

  execute format('create table if not exists public.price_observations (%s,
    product_id uuid, barcode text, product_name text not null, brand text, store text not null, store_location text,
    price double precision not null check (price >= 0 and price < 10000), regular_price double precision, is_offer boolean not null default false,
    package_count double precision, package_amount double precision, package_unit text, observed_at date not null,
    source text not null check (source in (''receipt'',''manual'',''open_prices'',''connector'',''demo'')), source_ref text)', common);

  execute format('create table if not exists public.savings (%s,
    purchase_id uuid, product_id uuid, amount double precision not null, verified boolean not null default false, date date not null, note text)', common);
end $$;

do $$
declare t text;
begin
  foreach t in array array['locations','products','batches','stock_movements','shopping_lists','list_items','purchases','purchase_items','price_observations','savings'] loop
    execute format('create index if not exists idx_%1$s_sync on public.%1$s (household_id, server_updated_at)', t);
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$s', t);
    execute format('create trigger trg_%1$s_touch before insert or update on public.%1$s for each row execute function public.hs_touch()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('create policy "%1$s_select" on public.%1$s for select to authenticated using (public.is_member(household_id))', t);
    execute format('create policy "%1$s_insert" on public.%1$s for insert to authenticated with check (public.is_member(household_id))', t);
    execute format('create policy "%1$s_update" on public.%1$s for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
    -- Sin política de DELETE: los borrados son lógicos (deleted = true) para que se sincronicen.
    begin
      execute format('alter publication supabase_realtime add table public.%1$s', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS de hogares, miembros y tokens
-- ---------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.push_tokens enable row level security;

drop policy if exists households_select on public.households;
drop policy if exists households_update on public.households;
create policy households_select on public.households for select to authenticated using (public.is_member(id));
create policy households_update on public.households for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select to authenticated using (public.is_member(household_id));

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No se puede cambiar el código de invitación ni el creador con un UPDATE directo.
create or replace function public.hs_households_guard() returns trigger language plpgsql as $$
begin
  if new.invite_code <> old.invite_code or new.created_by <> old.created_by or new.id <> old.id then
    if current_setting('hs.allow_code_change', true) is distinct from 'on' then
      raise exception 'Solo se puede cambiar el nombre del hogar';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_households_guard on public.households;
create trigger trg_households_guard before update on public.households for each row execute function public.hs_households_guard();

-- ---------------------------------------------------------------------
-- Funciones (RPC) para gestionar hogares de forma segura
-- ---------------------------------------------------------------------
create or replace function public.my_display_name() returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1)) from auth.users where id = auth.uid();
$$;

create or replace function public.create_household(p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from households where id = p_id) then
    if not is_member(p_id) then raise exception 'household exists'; end if;
    return p_id;
  end if;
  insert into households (id, name, created_by) values (p_id, coalesce(nullif(trim(p_name), ''), 'Mi casa'), auth.uid());
  insert into household_members (household_id, user_id, role, display_name) values (p_id, auth.uid(), 'admin', my_display_name());
  return p_id;
end $$;

create or replace function public.join_household(p_code text)
returns table (household_id uuid, name text) language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if not found then raise exception 'invalid invite code'; end if;
  insert into household_members (household_id, user_id, role, display_name)
  values (h.id, auth.uid(), 'member', my_display_name())
  on conflict on constraint household_members_pkey do nothing;
  return query select h.id, h.name;
end $$;

create or replace function public.regenerate_invite_code(p_household uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  if not is_admin(p_household) then raise exception 'only admins'; end if;
  perform set_config('hs.allow_code_change', 'on', true);
  update households set invite_code = code where id = p_household;
  return code;
end $$;

create or replace function public.set_member_role(p_household uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_household) then raise exception 'only admins'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid role'; end if;
  if p_role = 'member' and (select count(*) from household_members where household_id = p_household and role = 'admin') <= 1
     and exists (select 1 from household_members where household_id = p_household and user_id = p_user and role = 'admin') then
    raise exception 'the household needs at least one admin';
  end if;
  update household_members set role = p_role where household_id = p_household and user_id = p_user;
end $$;

create or replace function public.remove_member(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and not is_admin(p_household) then raise exception 'only admins'; end if;
  if exists (select 1 from household_members where household_id = p_household and user_id = p_user and role = 'admin')
     and (select count(*) from household_members where household_id = p_household and role = 'admin') <= 1
     and (select count(*) from household_members where household_id = p_household) > 1 then
    raise exception 'the household needs at least one admin';
  end if;
  delete from household_members where household_id = p_household and user_id = p_user;
end $$;

-- Derecho de supresión (RGPD): borra la cuenta, sus pertenencias y los hogares en los que era el único miembro.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from households h where exists (select 1 from household_members m where m.household_id = h.id and m.user_id = uid)
    and (select count(*) from household_members m2 where m2.household_id = h.id) = 1;
  delete from household_members where user_id = uid;
  delete from push_tokens where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.create_household(uuid, text), public.join_household(text), public.regenerate_invite_code(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.delete_my_account() to authenticated;
