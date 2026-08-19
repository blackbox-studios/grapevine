-- Locks this schema against the Supabase Data API.
--
--   npm run db:secure          (apply)
--   npm run db:reset           (migrate + secure + seed)
--
-- Idempotent. Safe to re-run, and it MUST be re-run after every `prisma migrate`,
-- because a migration that adds a table adds it unprotected.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Why this file exists
--
-- Nothing in this app talks to Supabase over the Data API. The browser uses
-- supabase-js for *auth only*; all data goes through our own /api, which reaches
-- Postgres over a direct connection as the table owner. So it is tempting to
-- conclude that Row Level Security is irrelevant here. That conclusion is wrong,
-- and it is wrong in a way that is invisible until someone exploits it.
--
-- Supabase auto-generates a REST (and optionally GraphQL) API over the `public`
-- schema. It is authenticated with the publishable/anon key — a key that is, by
-- design, embedded in our client bundle and readable by anyone who opens devtools.
-- If the `anon` or `authenticated` role holds table privileges, then:
--
--     GET https://<project>.supabase.co/rest/v1/post?select=*
--     apikey: <the key from our own JavaScript>
--
-- returns every post in every parish, bypassing requireViewer, requireMembership,
-- the APPROVED-membership feed scoping, and every other control in
-- src/lib/server/auth.js. The entire authorization model would be a front door
-- next to an open window.
--
-- Whether those privileges exist by default depends on when the project was
-- created: Supabase stopped granting them automatically for new projects around
-- 30 May 2026, and will apply that to existing projects on 30 October 2026. That is
-- a dashboard setting and a rollout date — not something an application's security
-- should rest on. This file makes the answer explicit and independent of both.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Why the app still works afterwards
--
-- Prisma connects as the role that owns these tables, and in Postgres a table owner
-- is exempt from RLS unless FORCE ROW LEVEL SECURITY is set. We deliberately do not
-- set it. So: RLS denies the Data API everything, and the application is unaffected.
--
-- Consequently there are no policies here. RLS enabled with zero policies is
-- deny-all, which is exactly the intent — a policy would be a hole, not a feature.
-- If you ever do want the browser to read a table directly, that is the moment to
-- write a policy for it, and to think hard about what it exposes.

begin;

-- 1. Enable RLS on every table in `public`.
--    Deny-all: with no policies, a non-owner role sees zero rows.
do $$
declare
    target record;
begin
    for target in
        select tablename
        from pg_tables
        where schemaname = 'public'
    loop
        execute format('alter table public.%I enable row level security', target.tablename);
    end loop;
end;
$$;

-- 2. Revoke the Data API roles' privileges outright.
--    Belt and braces alongside RLS, and it produces a clearer failure: PostgREST
--    answers `42501 permission denied for table ...` instead of an empty result set,
--    so a misconfiguration announces itself rather than looking like "no data".
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 3. Stop future tables from being granted.
--    Supabase's stock setup includes ALTER DEFAULT PRIVILEGES granting everything in
--    `public` to anon/authenticated. Without this, the next `prisma migrate` creates a
--    table that is exposed the moment it exists. Scoped to the role Prisma connects
--    as, since default privileges are per-creating-role.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

commit;

-- 4. Make step 1 self-maintaining.
--
--    Steps 1-3 are a snapshot; this is the ratchet. An event trigger fires on any
--    CREATE TABLE in `public` and enables RLS on it immediately, so a future
--    migration cannot introduce an unprotected table even if someone forgets to run
--    this file. That "someone forgets" case is the realistic failure mode — the
--    tables added a year from now by a person who never read this comment are
--    exactly the ones at risk.
create or replace function public.enforce_rls_on_new_tables()
    returns event_trigger
    language plpgsql
    -- SECURITY INVOKER (the default) is correct here: an event trigger already runs
    -- as the DDL's author, and DEFINER would add privilege for no reason.
    as $$
declare
    created record;
begin
    for created in
        select * from pg_event_trigger_ddl_commands()
        where command_tag = 'CREATE TABLE'
          and schema_name = 'public'
    loop
        execute format('alter table %s enable row level security', created.object_identity);
    end loop;
end;
$$;

drop event trigger if exists enforce_rls_on_new_tables;
create event trigger enforce_rls_on_new_tables
    on ddl_command_end
    when tag in ('CREATE TABLE')
    execute function public.enforce_rls_on_new_tables();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify
--
-- Should return zero rows. Any row is a table the Data API could reach.
--
--     select tablename
--     from pg_tables
--     where schemaname = 'public' and rowsecurity = false;
--
-- And this should list no privileges for anon/authenticated:
--
--     select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--     where table_schema = 'public' and grantee in ('anon', 'authenticated');
