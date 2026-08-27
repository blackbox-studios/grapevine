-- Creates the two roles Supabase provides and this project's lockdown revokes from.
--
-- Runs once, when the container initialises an empty data directory.
--
-- ── Why a plain Postgres container needs Supabase's roles ────────────────────
--
-- `prisma/policies.sql` — the file `npm run db:secure` applies after every migration —
-- ends in:
--
--     revoke all on all tables in schema public from anon, authenticated;
--     alter default privileges in schema public revoke all on tables from anon, authenticated;
--
-- Postgres has no `revoke ... from a-role-that-does-not-exist`; it raises
-- `role "anon" does not exist` and the whole script aborts. Without these two roles,
-- `db:secure` would simply fail locally, and the usual response to a step that always
-- fails in dev is to stop running it — which is precisely the step that stands between
-- every parish's posts and a key compiled into our own client bundle.
--
-- So the roles exist here for one reason: **so the lockdown runs identically in both
-- places**. A migration that adds a table policies.sql cannot protect now fails on a
-- laptop, in seconds, instead of in production. They are `nologin` and hold nothing —
-- nothing in this container ever authenticates as them, and there is no PostgREST here
-- for them to authenticate to. They are targets for a revoke, not accounts.
--
-- Keep the names in step with policies.sql. If Supabase ever adds a third role to that
-- revoke list, it belongs here too.

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
    end if;

    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
    end if;
end
$$;

-- Supabase grants `usage` on the public schema to both roles, and the point of this
-- container is to reproduce the state policies.sql is written against — including the
-- grants it exists to take away. Starting from a stricter position than production
-- would let a revoke that is silently a no-op here still matter there.
grant usage on schema public to anon, authenticated;
