-- Access is managed manually in the dashboard; visitors cannot request access.
begin;
alter table public.beta_access alter column status set default 'approved';
-- Preserve existing pending/rejected rows; only newly inserted emails default to allowed.
create or replace function public.beta_signup_gate(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.beta_access
    where email = lower(btrim(event -> 'user' ->> 'email')) and status = 'approved'
  ) and coalesce((event -> 'user' ->> 'is_anonymous')::boolean, false) = false then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This email does not have access to Notes. Contact the administrator.'
  ));
end;
$$;
revoke all on function public.beta_signup_gate(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.beta_signup_gate(jsonb) to supabase_auth_admin;
comment on table public.beta_access is 'Manually managed Notes access list. Add a lowercase email; new rows default to approved. Users create their own password through Sign up. Set rejected or delete a row to revoke access. No public invite requests or passwords are stored here.';
commit;
