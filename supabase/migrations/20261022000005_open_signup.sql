-- Open self sign-up. Anyone may create an account from the login page; new accounts are
-- always facilitators (the role comes only from app_metadata, which users cannot set).
-- Admins can limit sign-ups to work email domains with settings.signup.allowed_domains.
-- The check runs in the database, so it cannot be bypassed by calling the Auth API directly.
-- Emails an admin invites are added to signup_allowlist first, so admins can still invite
-- e.g. an external grader.

insert into public.settings (key, value)
values ('signup', '{"allowed_domains": []}'::jsonb)
on conflict (key) do nothing;

create table public.signup_allowlist (
  email text primary key check (email = lower(email)),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security;
create policy "signup_allowlist: admin" on public.signup_allowlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.signup_allowlist from anon;

create function public.check_signup_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed jsonb := coalesce(
    (select value -> 'allowed_domains' from public.settings where key = 'signup'),
    '[]'::jsonb
  );
begin
  if jsonb_array_length(allowed) > 0
     and not exists (select 1 from public.signup_allowlist a where a.email = lower(new.email))
     and not exists (
       select 1 from jsonb_array_elements_text(allowed) d
       where lower(split_part(new.email, '@', 2)) = lower(trim(leading '@' from trim(d)))
     ) then
    raise exception 'Sign-up is limited to work email addresses.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger before_auth_user_created
  before insert on auth.users
  for each row execute function public.check_signup_domain();

revoke execute on function public.check_signup_domain() from public, anon, authenticated;
