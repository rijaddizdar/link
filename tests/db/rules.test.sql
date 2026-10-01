-- Database-level checks for the rules the app must not be able to talk its way
-- around: couple isolation, partner approval, expiry, and own-row-only logging.
--
-- Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/db/rules.test.sql
-- Everything happens inside a transaction that is rolled back at the end.

begin;

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function pg_temp.check(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice 'ok    %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end;
$$;

-- Runs a statement as a given user and asserts it raises.
create or replace function pg_temp.expect_error(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL  % (expected an error, got none)', p_label;
exception
  when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok    % (%)', p_label, left(sqlerrm, 70);
end;
$$;

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function pg_temp.act_as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- --- three users: a couple (alex, sam) and an unrelated outsider -------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex@example.test', 'x', now(), '{}', '{"display_name":"Alex"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.test',  'x', now(), '{}', '{"display_name":"Sam"}',  now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nosy@example.test', 'x', now(), '{}', '{"display_name":"Nosy"}', now(), now());

select pg_temp.check(
  'signing up creates a profile',
  (select count(*) from public.profiles where id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333')) = 3
);

-- --- linking ----------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

create temporary table t_code as
  select (public.generate_invite_code('Europe/Berlin', '21:30')).code as code;

select pg_temp.check(
  'the code uses the unambiguous 8-character alphabet',
  (select code from t_code) ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'
);

select pg_temp.check(
  'generating a code puts the first partner in a couple',
  public.current_couple_id() is not null
);

select pg_temp.check(
  'before linking there is no partner',
  public.partner_id(public.current_couple_id()) is null
);

select pg_temp.expect_error(
  'you cannot redeem your own code',
  format('select public.redeem_invite_code(%L)', (select code from t_code))
);

-- The partner redeems it, typed in lower case with a separator.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select pg_temp.check(
  'a code works typed in lower case with a dash',
  public.redeem_invite_code(
    lower(substr((select code from t_code), 1, 4)) || '-' || lower(substr((select code from t_code), 5, 4))
  ) is not null
);

select pg_temp.check(
  'both partners are now in the same couple',
  public.partner_id(public.current_couple_id()) = '11111111-1111-1111-1111-111111111111'
);

select pg_temp.check(
  'the couple time zone is the one set at linking',
  (select time_zone from public.couples where id = public.current_couple_id()) = 'Europe/Berlin'
);

select pg_temp.check(
  'the end-of-day time agreed at linking is the couple time',
  (select day_end_time from public.couples where id = public.current_couple_id()) = '21:30'::time
);

select pg_temp.expect_error(
  'a used code cannot be redeemed twice',
  format('select public.redeem_invite_code(%L)', (select code from t_code))
);

-- A nonsense code is rejected rather than silently doing nothing.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.expect_error(
  'an unknown code is rejected',
  'select public.redeem_invite_code(''ZZZZ9999'')'
);

select pg_temp.check(
  'someone with no couple sees no couple',
  public.current_couple_id() is null
);

select pg_temp.check(
  'someone with no couple sees no tasks',
  (select count(*) from public.tasks) = 0
);

select pg_temp.expect_error(
  'someone with no couple cannot propose a task',
  'select public.propose_task(''{"title":"Sneak in","schedule_kind":"daily"}''::jsonb)'
);

-- --- partner approval -------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

create temporary table t_prop as
  select (public.propose_task(
    '{"title":"Morning walk","schedule_kind":"daily","emoji":"🚶","color":"coral"}'::jsonb,
    'shall we?'
  )).id as id;

select pg_temp.check(
  'a proposal does not put anything on the shared list yet',
  (select count(*) from public.tasks) = 0
);

select pg_temp.check(
  'a proposal expires seven days out',
  (select date_trunc('minute', expires_at - created_at) from public.task_proposals
    where id = (select id from t_prop)) = interval '7 days'
);

select pg_temp.expect_error(
  'the proposer cannot approve their own proposal',
  format('select public.approve_proposal(%L)', (select id from t_prop))
);

select pg_temp.expect_error(
  'the proposer cannot decline their own proposal either',
  format('select public.reject_proposal(%L)', (select id from t_prop))
);

-- The outsider must not be able to touch it at all.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check(
  'an outsider cannot even see the proposal',
  (select count(*) from public.task_proposals) = 0
);
select pg_temp.expect_error(
  'an outsider cannot approve it',
  format('select public.approve_proposal(%L)', (select id from t_prop))
);

-- The partner can.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.check(
  'the partner can approve',
  (public.approve_proposal((select id from t_prop))).status = 'approved'
);

select pg_temp.check(
  'approval puts exactly one task on the shared list',
  (select count(*) from public.tasks) = 1
);

select pg_temp.check(
  'the approved task keeps the proposer customisation',
  (select title = 'Morning walk' and emoji = '🚶' and color = 'coral' and schedule_kind = 'daily'
   from public.tasks limit 1)
);

select pg_temp.check(
  'the task is credited to whoever proposed it',
  (select created_by from public.tasks limit 1) = '11111111-1111-1111-1111-111111111111'
);

select pg_temp.expect_error(
  'an approved proposal cannot be approved again',
  format('select public.approve_proposal(%L)', (select id from t_prop))
);

-- --- expiry -----------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

create temporary table t_stale as
  select (public.propose_task('{"title":"Never answered","schedule_kind":"daily"}'::jsonb)).id as id;

select pg_temp.act_as_owner();
update public.task_proposals
  set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
  where id = (select id from t_stale);

select pg_temp.check(
  'expire_stale_proposals closes the seven-day window',
  public.expire_stale_proposals() = 1
);

select pg_temp.check(
  'the stale proposal is marked expired',
  (select status from public.task_proposals where id = (select id from t_stale)) = 'expired'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error(
  'an expired proposal can no longer be approved',
  format('select public.approve_proposal(%L)', (select id from t_stale))
);

select pg_temp.check(
  'an expired proposal never reached the shared list',
  (select count(*) from public.tasks) = 1
);

-- --- edits and deletions need approval too ----------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

create temporary table t_task as select id from public.tasks limit 1;

create temporary table t_edit as
  select (public.propose_task_edit(
    (select id from t_task),
    '{"title":"Evening walk","schedule_kind":"weekdays","weekdays":[1,3,5]}'::jsonb
  )).id as id;

select pg_temp.check(
  'an edit does not change the task before approval',
  (select title from public.tasks where id = (select id from t_task)) = 'Morning walk'
);

select pg_temp.expect_error(
  'a task can only have one change waiting at a time',
  format('select public.propose_task_delete(%L)', (select id from t_task))
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.approve_proposal((select id from t_edit));

select pg_temp.check(
  'approving an edit applies every changed field',
  (select title = 'Evening walk' and schedule_kind = 'weekdays' and weekdays = '{1,3,5}'::smallint[]
   from public.tasks where id = (select id from t_task))
);

-- A declined deletion leaves the task alone.
create temporary table t_del as
  select (public.propose_task_delete((select id from t_task))).id as id;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.reject_proposal((select id from t_del));

select pg_temp.check(
  'a declined removal leaves the task on the list',
  (select archived_at is null from public.tasks where id = (select id from t_task))
);

-- --- the shared end-of-day time ---------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select pg_temp.expect_error(
  'the end-of-day time cannot be changed by writing to the table',
  format('update public.couples set day_end_time = ''06:00'' where id = %L',
         public.current_couple_id())
);

-- Two statements: the update has to land before the value is read back.
update public.couples set time_zone = 'Europe/Madrid' where id = public.current_couple_id();
select pg_temp.check(
  'the time zone is still directly editable',
  (select time_zone from public.couples where id = public.current_couple_id()) = 'Europe/Madrid'
);

create temporary table t_dayend as
  select (public.propose_day_end_time('22:15', 'later for me')).id as id;

select pg_temp.check(
  'proposing a new end-of-day time does not change it yet',
  (select day_end_time from public.couples where id = public.current_couple_id()) = '21:30'::time
);

select pg_temp.expect_error(
  'you cannot approve your own end-of-day change',
  format('select public.approve_proposal(%L)', (select id from t_dayend))
);

select pg_temp.expect_error(
  'only one end-of-day change can wait at a time',
  'select public.propose_day_end_time(''23:00'')'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.approve_proposal((select id from t_dayend));

select pg_temp.check(
  'approving the change moves the end-of-day time for both of them',
  (select day_end_time from public.couples where id = public.current_couple_id()) = '22:15'::time
);

select pg_temp.expect_error(
  'proposing the time it already is is refused',
  'select public.propose_day_end_time(''22:15'')'
);

-- A declined change leaves the time alone.
create temporary table t_dayend2 as
  select (public.propose_day_end_time('02:00')).id as id;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.reject_proposal((select id from t_dayend2));
select pg_temp.check(
  'a declined end-of-day change leaves the time where it was',
  (select day_end_time from public.couples where id = public.current_couple_id()) = '22:15'::time
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

-- --- completion logging -----------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.set_completion((select id from t_task), 1, '2026-06-03');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.set_completion((select id from t_task), 1, '2026-06-03');

select pg_temp.check(
  'each partner logs the same task separately, and both are visible',
  (select count(*) from public.task_completions
    where task_id = (select id from t_task) and local_date = '2026-06-03') = 2
);

select pg_temp.check(
  'logging again on the same day updates rather than duplicating',
  (public.set_completion((select id from t_task), 5, '2026-06-03')).count = 5
);

-- Two statements, because the delete has to happen before the count is read.
select pg_temp.check(
  'clearing a log returns nothing',
  public.set_completion((select id from t_task), 0, '2026-06-03') is null
);
select pg_temp.check(
  'a count of zero removes my row and leaves my partner row alone',
  (select count(*) from public.task_completions
     where task_id = (select id from t_task)
       and user_id = '22222222-2222-2222-2222-222222222222') = 0
  and (select count(*) from public.task_completions
     where task_id = (select id from t_task)
       and user_id = '11111111-1111-1111-1111-111111111111') = 1
);

select pg_temp.expect_error(
  'you cannot log a completion in your partner name',
  format(
    'insert into public.task_completions (couple_id, task_id, user_id, local_date, count)
     values (%L, %L, %L, ''2026-06-04'', 1)',
    public.current_couple_id(), (select id from t_task),
    '11111111-1111-1111-1111-111111111111'
  )
);

select pg_temp.check(
  'the local date follows the couple time zone',
  -- 23:30 UTC is already the next day in Berlin.
  public.couple_local_date(public.current_couple_id(), '2026-06-03 23:30:00+00'::timestamptz)
    = '2026-06-04'
);

-- --- direct writes are refused ----------------------------------------------

select pg_temp.expect_error(
  'a task cannot be inserted directly, bypassing approval',
  format(
    'insert into public.tasks (couple_id, title, schedule_kind, created_by)
     values (%L, ''Snuck in'', ''daily'', %L)',
    public.current_couple_id(), '22222222-2222-2222-2222-222222222222'
  )
);

select pg_temp.expect_error(
  'a task cannot be edited directly',
  format('update public.tasks set title = ''Hijacked'' where id = %L', (select id from t_task))
);

select pg_temp.expect_error(
  'a task cannot be deleted directly',
  format('delete from public.tasks where id = %L', (select id from t_task))
);

select pg_temp.expect_error(
  'a proposal cannot be approved by writing to the table',
  'update public.task_proposals set status = ''approved'''
);

-- --- isolation from the outsider --------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select pg_temp.check(
  'an outsider sees none of the couple tasks',
  (select count(*) from public.tasks) = 0
);
select pg_temp.check(
  'an outsider sees none of the couple completions',
  (select count(*) from public.task_completions) = 0
);
select pg_temp.check(
  'an outsider sees none of the couple invite codes',
  (select count(*) from public.invite_codes) = 0
);
select pg_temp.check(
  'an outsider sees no couple',
  (select count(*) from public.couples) = 0
);
select pg_temp.check(
  'an outsider sees only their own profile',
  (select count(*) from public.profiles) = 1
);

-- --- unlink, restore, purge -------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

create temporary table t_couple as select public.current_couple_id() as id;

select pg_temp.check(
  'unlinking sets a thirty-day grace period',
  (select date_trunc('day', purge_after - unlinked_at) from public.request_unlink())
    = interval '30 days'
);

select pg_temp.check(
  'after unlinking there is no active couple',
  public.current_couple_id() is null
);

select pg_temp.check(
  'after unlinking the shared tasks are not reachable',
  (select count(*) from public.tasks) = 0
);

select pg_temp.act_as_owner();
select pg_temp.check(
  'the shared history is still on disk during the grace period',
  (select count(*) from public.tasks where couple_id = (select id from t_couple)) = 1
);

select pg_temp.check(
  'nothing is purged while the grace period runs',
  public.purge_expired_couples() = 0
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.check(
  'the other partner can undo the unlink inside the grace period',
  (public.restore_link((select id from t_couple))).unlinked_at is null
);
select pg_temp.check(
  'restoring brings the shared list back',
  (select count(*) from public.tasks) = 1
);

-- Unlink again and let the window close.
select public.request_unlink();
select pg_temp.act_as_owner();
update public.couples
  set unlinked_at = now() - interval '31 days', purge_after = now() - interval '1 day'
  where id = (select id from t_couple);

select pg_temp.check(
  'once the grace period passes the shared history is purged',
  public.purge_expired_couples() = 1
);
select pg_temp.check(
  'purging removes the tasks with the couple',
  (select count(*) from public.tasks where couple_id = (select id from t_couple)) = 0
);
select pg_temp.check(
  'purging removes the completions too',
  (select count(*) from public.task_completions where couple_id = (select id from t_couple)) = 0
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error(
  'a purged link cannot be restored',
  format('select public.restore_link(%L)', (select id from t_couple))
);

rollback;
