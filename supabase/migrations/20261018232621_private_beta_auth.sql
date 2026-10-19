-- Private-beta requests. Passwords are handled exclusively by Supabase Auth.
begin;
create table public.beta_access (
  email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now()
);
alter table public.beta_access enable row level security;
revoke all on public.beta_access from anon, authenticated;
grant select on public.beta_access to authenticated, supabase_auth_admin;
grant select, insert, update, delete on public.beta_access to service_role;
create policy "Read own access status" on public.beta_access for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email'));
create policy "Signup hook reads approval" on public.beta_access for select to supabase_auth_admin
  using (true);

-- Invoker privileges: only Auth may run this hook, with read-only table access.
create function public.beta_signup_gate(event jsonb)
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
    'message', 'Your email has not been approved yet. Request an invite from the homepage.'
  ));
end;
$$;
revoke all on function public.beta_signup_gate(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.beta_signup_gate(jsonb) to supabase_auth_admin;
comment on table public.beta_access is 'Tester requests: approve an email here, then send its invite from Authentication > Users. No passwords are stored here.';
commit;
