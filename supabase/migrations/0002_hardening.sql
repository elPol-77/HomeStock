-- Funciones de trigger con search_path fijo
alter function public.hs_touch() set search_path = public, pg_temp;
alter function public.hs_households_guard() set search_path = public, pg_temp;

-- Las funciones SECURITY DEFINER solo para usuarios con sesión (no para el rol anónimo)
revoke execute on function public.create_household(uuid, text) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.my_display_name() from public, anon;
revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

grant execute on function public.create_household(uuid, text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.my_display_name() to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
