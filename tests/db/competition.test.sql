-- Database-level checks for the daily competition: where a day starts and stops,
-- how a day is settled, challenges, and the streak and month tallies.
--
-- Run with:  ./scripts/test-db.sh   (or psql ... -f tests/db/competition.test.sql)
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

-- Adds an already-approved task straight to the list, so these tests are about
-- scoring rather than about the approval flow (which rules.test.sql covers).
create or replace function pg_temp.add_task(
  p_couple uuid, p_title text, p_target integer default null,
  p_kind public.schedule_kind default 'daily', p_weekdays smallint[] default '{}',
  p_due date default null
)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.tasks (couple_id, title, schedule_kind, weekdays, due_date, target_count, created_by)
  values (p_couple, p_title, p_kind, p_weekdays, p_due, p_target,
          (select user_id from public.couple_members where couple_id = p_couple limit 1))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function pg_temp.log_for(
  p_couple uuid, p_task uuid, p_user uuid, p_date date, p_count integer default 1
)
returns void language plpgsql as $$
begin
  insert into public.task_completions (couple_id, task_id, user_id, local_date, count)
  values (p_couple, p_task, p_user, p_date, p_count)
  on conflict (task_id, user_id, local_date) do update set count = excluded.count;
end;
$$;

-- --- a linked couple --------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alex@example.test', 'x', now(), '{}', '{"display_name":"Alex"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.test',  'x', now(), '{}', '{"display_name":"Sam"}',  now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nosy@example.test', 'x', now(), '{}', '{"display_name":"Nosy"}', now(), now());

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
create temporary table t_code as
  select (public.generate_invite_code('Europe/Berlin', '21:00')).code as code;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.redeem_invite_code((select code from t_code));

create temporary table t_couple as select public.current_couple_id() as id;
select pg_temp.act_as_owner();

-- The couple has to have existed long enough for the days below to be settleable.
update public.couples set created_at = now() - interval '40 days' where id = (select id from t_couple);

-- --- where a day starts and stops -------------------------------------------

select pg_temp.check(
  'before the end-of-day time you are still on that day',
  -- 18:00 Berlin, day ends 21:00.
  public.couple_active_date((select id from t_couple), '2026-10-02 16:00:00+00') = '2026-10-02'
);

select pg_temp.check(
  'at the end-of-day time the day rolls over to tomorrow',
  -- 21:00 Berlin exactly.
  public.couple_active_date((select id from t_couple), '2026-10-02 19:00:00+00') = '2026-10-03'
);

select pg_temp.check(
  'and stays on tomorrow for the rest of the evening',
  public.couple_active_date((select id from t_couple), '2026-10-02 22:00:00+00') = '2026-10-03'
);

select pg_temp.check(
  'a day closes at the agreed time in the couple zone',
  public.couple_day_closes_at((select id from t_couple), '2026-10-02') = '2026-10-02 19:00:00+00'
);

select pg_temp.check(
  'the close follows daylight saving rather than drifting an hour',
  -- Berlin leaves CEST on 25 October 2026.
  public.couple_day_closes_at((select id from t_couple), '2026-10-26') = '2026-10-26 20:00:00+00'
);

-- --- settling a day ---------------------------------------------------------

create temporary table t_tasks as
  select
    pg_temp.add_task((select id from t_couple), 'Morning walk') as walk,
    pg_temp.add_task((select id from t_couple), 'Glasses of water', 8) as water,
    pg_temp.add_task((select id from t_couple), 'Read 10 pages') as read;

-- Yesterday, in the couple's own reckoning.
create temporary table t_day as
  select public.couple_active_date((select id from t_couple)) - 1 as d;

select pg_temp.check(
  'a day that has not closed yet cannot be settled',
  public.settle_day((select id from t_couple), public.couple_active_date((select id from t_couple)))
    is null
);

-- Alex clears two, Sam one and falls short on the counter.
select pg_temp.log_for((select id from t_couple), (select walk from t_tasks), '11111111-1111-1111-1111-111111111111', (select d from t_day));
select pg_temp.log_for((select id from t_couple), (select water from t_tasks), '11111111-1111-1111-1111-111111111111', (select d from t_day), 8);
select pg_temp.log_for((select id from t_couple), (select walk from t_tasks), '22222222-2222-2222-2222-222222222222', (select d from t_day));
select pg_temp.log_for((select id from t_couple), (select water from t_tasks), '22222222-2222-2222-2222-222222222222', (select d from t_day), 7);

create temporary table t_res as
  select * from public.settle_day((select id from t_couple), (select d from t_day));

select pg_temp.check(
  'the day counts every scheduled task',
  (select scheduled_count from t_res) = 3
);

select pg_temp.check(
  'a counter short of its target does not count',
  (select scores ->> '22222222-2222-2222-2222-222222222222' from t_res)::int = 1
);

select pg_temp.check(
  'a counter that reached its target does',
  (select scores ->> '11111111-1111-1111-1111-111111111111' from t_res)::int = 2
);

select pg_temp.check(
  'the day goes to whoever did more',
  (select winner_user_id from t_res) = '11111111-1111-1111-1111-111111111111'
);

select pg_temp.check(
  'neither of them cleared everything, so it is not a streak day',
  (select both_complete from t_res) = false
);

select pg_temp.check(
  'settling again returns the same settled day rather than redoing it',
  (select settled_at from public.settle_day((select id from t_couple), (select d from t_day)))
    = (select settled_at from t_res)
);

-- A settled day is history: changing the list now must not rewrite it.
select pg_temp.act_as_owner();
update public.tasks set archived_at = now() where id = (select read from t_tasks);
select pg_temp.check(
  'archiving a task afterwards does not rewrite a settled day',
  (select scheduled_count from public.day_results
    where couple_id = (select id from t_couple) and local_date = (select d from t_day)) = 3
);
update public.tasks set archived_at = null where id = (select read from t_tasks);

-- --- ties -------------------------------------------------------------------

create temporary table t_day2 as select (select d from t_day) - 1 as d;
select pg_temp.log_for((select id from t_couple), (select walk from t_tasks), '11111111-1111-1111-1111-111111111111', (select d from t_day2));
select pg_temp.log_for((select id from t_couple), (select walk from t_tasks), '22222222-2222-2222-2222-222222222222', (select d from t_day2));

select pg_temp.check(
  'equal counts are a tie, with nobody recorded as the winner',
  (select winner_user_id from public.settle_day((select id from t_couple), (select d from t_day2)))
    is null
);

-- A day neither of them touched is a tie too, not a win at zero.
create temporary table t_day3 as select (select d from t_day) - 2 as d;
select pg_temp.check(
  'a day neither of them touched is a tie, not a win at nothing',
  (select winner_user_id from public.settle_day((select id from t_couple), (select d from t_day3)))
    is null
);
select pg_temp.check(
  'and it is not a streak day either',
  (select both_complete from public.day_results
    where couple_id = (select id from t_couple) and local_date = (select d from t_day3)) = false
);

-- --- a day they both cleared ------------------------------------------------

create temporary table t_day4 as select (select d from t_day) - 3 as d;
select pg_temp.log_for((select id from t_couple), (select walk from t_tasks), '11111111-1111-1111-1111-111111111111', (select d from t_day4));
select pg_temp.log_for((select id from t_couple), (select water from t_tasks), '11111111-1111-1111-1111-111111111111', (select d from t_day4), 8);
select pg_temp.log_for((select id from t_couple), (select read from t_tasks), '11111111-1111-1111-1111-111111111111', (select d from t_day4));
select pg_temp.log_for((select id from t_couple), (select walk from t_tasks), '22222222-2222-2222-2222-222222222222', (select d from t_day4));
select pg_temp.log_for((select id from t_couple), (select water from t_tasks), '22222222-2222-2222-2222-222222222222', (select d from t_day4), 9);
select pg_temp.log_for((select id from t_couple), (select read from t_tasks), '22222222-2222-2222-2222-222222222222', (select d from t_day4));

select pg_temp.check(
  'a day they both cleared is a streak day and a tie',
  (select both_complete and winner_user_id is null
   from public.settle_day((select id from t_couple), (select d from t_day4)))
);

select pg_temp.check(
  'going past a counter target still only counts once',
  (select scores ->> '22222222-2222-2222-2222-222222222222' from public.day_results
    where couple_id = (select id from t_couple) and local_date = (select d from t_day4))::int = 3
);

-- --- settling in bulk -------------------------------------------------------

select pg_temp.check(
  'settle_due_days fills in the days that closed while nobody looked',
  public.settle_due_days((select id from t_couple), 10) > 0
);

select pg_temp.check(
  'and running it again settles nothing, because they are all done',
  public.settle_due_days((select id from t_couple), 10) = 0
);

select pg_temp.check(
  'it never settles the day still being lived',
  not exists (
    select 1 from public.day_results
    where couple_id = (select id from t_couple)
      and local_date >= public.couple_active_date((select id from t_couple))
  )
);

select pg_temp.check(
  'settle_all_due_days is safe to run when nothing is owing',
  public.settle_all_due_days() = 0
);

-- The temp tables above were created while acting as the owner, so the
-- authenticated role has to be let in to read them from here on.
grant select on t_tasks, t_day, t_res, t_day2, t_day3, t_day4 to authenticated;

-- --- logging follows the agreed day -----------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select pg_temp.expect_error(
  'a closed day can no longer be logged against',
  format('select public.set_completion(%L, 1, %L)', (select walk from t_tasks), (select d from t_day))
);

select pg_temp.check(
  'logging with no date given lands on the day they are actually living',
  (public.set_completion((select walk from t_tasks), 1)).local_date
    = public.couple_active_date((select id from t_couple))
);

-- --- challenges -------------------------------------------------------------

create temporary table t_today as
  select public.couple_active_date((select id from t_couple)) as d;

-- Sam logs something today for Alex to ask about.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.set_completion((select water from t_tasks), 8);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select pg_temp.expect_error(
  'you cannot ask about a log that does not exist',
  format('select public.raise_challenge(%L, %L)', (select read from t_tasks), (select d from t_today))
);

create temporary table t_chal as
  select (public.raise_challenge((select water from t_tasks), (select d from t_today), 'eight already?')).id as id;

select pg_temp.check(
  'asking does not remove the log — logs are trusted',
  (select count from public.task_completions
    where task_id = (select water from t_tasks)
      and user_id = '22222222-2222-2222-2222-222222222222'
      and local_date = (select d from t_today)) = 8
);

select pg_temp.expect_error(
  'you cannot ask about the same log twice',
  format('select public.raise_challenge(%L, %L)', (select water from t_tasks), (select d from t_today))
);

select pg_temp.expect_error(
  'the partner who asked cannot answer for the one who logged it',
  format('select public.concede_challenge(%L)', (select id from t_chal))
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error(
  'the partner who logged it cannot withdraw the question',
  format('select public.withdraw_challenge(%L)', (select id from t_chal))
);

select pg_temp.check(
  'standing by your log leaves it exactly as it was',
  (select status from public.stand_by_log((select id from t_chal))) = 'stood_by'
);
select pg_temp.check(
  'and the log is still there',
  (select count from public.task_completions
    where task_id = (select water from t_tasks)
      and user_id = '22222222-2222-2222-2222-222222222222'
      and local_date = (select d from t_today)) = 8
);

-- Conceding is the only thing that clears a log, and only the logger can do it.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
create temporary table t_chal2 as
  select (public.raise_challenge((select water from t_tasks), (select d from t_today), 'really?')).id as id;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.concede_challenge((select id from t_chal2));

select pg_temp.check(
  'conceding clears the log it was about',
  not exists (
    select 1 from public.task_completions
    where task_id = (select water from t_tasks)
      and user_id = '22222222-2222-2222-2222-222222222222'
      and local_date = (select d from t_today)
  )
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error(
  'a day that has closed can no longer be questioned',
  format('select public.raise_challenge(%L, %L)', (select walk from t_tasks), (select d from t_day))
);

-- --- isolation --------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check(
  'an outsider sees none of the couple results',
  (select count(*) from public.day_results) = 0
);
select pg_temp.check(
  'an outsider sees none of the couple challenges',
  (select count(*) from public.completion_challenges) = 0
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error(
  'a result cannot be written by hand',
  format(
    'insert into public.day_results (couple_id, local_date, scheduled_count, scores, both_complete)
     values (%L, ''2020-01-01'', 1, ''{}''::jsonb, true)', (select id from t_couple))
);
select pg_temp.expect_error(
  'a settled day cannot be edited to change who won',
  'update public.day_results set winner_user_id = ''22222222-2222-2222-2222-222222222222'''
);

rollback;
