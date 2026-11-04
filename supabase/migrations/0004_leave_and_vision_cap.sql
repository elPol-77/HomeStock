-- Si el último miembro sale de una casa, la casa y todos sus datos se borran (no quedan huérfanos).
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
  if not exists (select 1 from household_members where household_id = p_household) then
    delete from households where id = p_household;
  end if;
end $$;

-- Cupo de fotos con IA: por persona y, además, un tope global diario para no agotar el plan gratuito.
drop function if exists public.vision_consume(uuid, integer);
create or replace function public.vision_consume(p_user uuid, p_limit integer, p_global integer default 400)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('vision_consume'));
  if (select coalesce(sum(count), 0) from vision_usage where day = v_day) >= p_global then return -2; end if;
  insert into vision_usage (user_id, day, count) values (p_user, v_day, 0)
  on conflict (user_id, day) do nothing;
  update vision_usage set count = count + 1
   where user_id = p_user and day = v_day and count < p_limit
  returning count into v_count;
  if v_count is null then return -1; end if;
  delete from vision_usage where day < v_day - 7;
  return p_limit - v_count;
end $$;

revoke all on function public.vision_consume(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.vision_consume(uuid, integer, integer) to service_role;
