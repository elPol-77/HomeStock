-- Cupo diario del reconocimiento de fotos con IA (Edge Function «vision»).
-- Solo la función (service_role) puede leer o modificar estos datos.
create table if not exists public.vision_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Madrid')::date,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.vision_usage enable row level security;
-- Sin políticas: nadie con la clave pública puede verla.

-- Suma un uso y devuelve los que quedan hoy (-1 si ya no quedan, sin sumar).
create or replace function public.vision_consume(p_user uuid, p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  v_count integer;
begin
  insert into vision_usage (user_id, day, count) values (p_user, v_day, 0)
  on conflict (user_id, day) do nothing;
  update vision_usage set count = count + 1
   where user_id = p_user and day = v_day and count < p_limit
  returning count into v_count;
  if v_count is null then return -1; end if;
  delete from vision_usage where day < v_day - 7; -- limpieza
  return p_limit - v_count;
end $$;

-- Devuelve el uso si Gemini falló (para no penalizar errores ajenos).
create or replace function public.vision_refund(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update vision_usage set count = greatest(0, count - 1)
   where user_id = p_user and day = (now() at time zone 'Europe/Madrid')::date;
$$;

revoke all on function public.vision_consume(uuid, integer) from public, anon, authenticated;
revoke all on function public.vision_refund(uuid) from public, anon, authenticated;
grant execute on function public.vision_consume(uuid, integer) to service_role;
grant execute on function public.vision_refund(uuid) to service_role;
