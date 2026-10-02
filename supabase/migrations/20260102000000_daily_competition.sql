-- The daily competition and the calendar.
--
-- At the couple's agreed end-of-day time the day closes and whoever finished
-- more of that day's scheduled tasks wins it. Equal counts are a tie. A shared
-- streak counts days both of them finished everything.
--
-- A settled day is written once and never recomputed, so editing the task list
-- later cannot rewrite who won last Tuesday.

-- ---------------------------------------------------------------------------
-- Where a day starts and stops
-- ---------------------------------------------------------------------------

-- The day the couple is logging into right now. The agreed end-of-day time, not
-- midnight, is the rollover: at 9:01 PM on the 2nd you are already on the 3rd.
create or replace function public.couple_active_date(p_couple_id uuid, p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
    when (p_at at time zone c.time_zone)::time >= c.day_end_time
      then ((p_at at time zone c.time_zone)::date + 1)
    else (p_at at time zone c.time_zone)::date
  end
  from public.couples c
  where c.id = p_couple_id
$$;

-- The instant a given day closes: that date, at the agreed time, in their zone.
create or replace function public.couple_day_closes_at(p_couple_id uuid, p_local_date date)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select (p_local_date + c.day_end_time) at time zone c.time_zone
  from public.couples c
  where c.id = p_couple_id
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create type public.challenge_status as enum ('open', 'withdrawn', 'conceded', 'stood_by');

create table public.day_results (
  couple_id       uuid not null references public.couples (id) on delete cascade,
  local_date      date not null,
  scheduled_count integer not null,
  -- user id → how many of that day's scheduled tasks they finished.
  scores          jsonb not null,
  -- NULL is a tie, which the design shows as a shared heart rather than a loss.
  winner_user_id  uuid references auth.users (id) on delete set null,
  both_complete   boolean not null,
  settled_at      timestamptz not null default now(),
  primary key (couple_id, local_date)
);

create index day_results_couple_date_idx on public.day_results (couple_id, local_date desc);

-- One partner questioning the other's log. Logs are trusted: a challenge never
-- removes one by itself, it only asks. Only the person who logged it can clear it.
create table public.completion_challenges (
  id                  uuid primary key default gen_random_uuid(),
  couple_id           uuid not null references public.couples (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,
  challenged_user_id  uuid not null references auth.users (id) on delete cascade,
  local_date          date not null,
  raised_by           uuid not null references auth.users (id) on delete cascade,
  reason              text not null default '' check (length(reason) <= 500),
  status              public.challenge_status not null default 'open',
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint challenge_not_self check (challenged_user_id <> raised_by),
  constraint challenge_resolution check (
    (status = 'open' and resolved_at is null) or (status <> 'open' and resolved_at is not null)
  )
);

-- One open challenge per log at a time.
create unique index completion_challenges_one_open
  on public.completion_challenges (task_id, challenged_user_id, local_date)
  where status = 'open';

create index completion_challenges_couple_date_idx
  on public.completion_challenges (couple_id, local_date);

-- ---------------------------------------------------------------------------
-- Settling a day
-- ---------------------------------------------------------------------------

-- Was this task on the list for this date?
create or replace function public.task_scheduled_on(
  p_schedule_kind public.schedule_kind,
  p_weekdays smallint[],
  p_due_date date,
  p_local_date date
)
returns boolean
language sql
immutable
parallel safe
as $$
  select case p_schedule_kind
    when 'daily'    then true
    when 'weekdays' then extract(isodow from p_local_date)::smallint = any(p_weekdays)
    when 'once'     then p_due_date = p_local_date
  end
$$;

/*
 * Settles one closed day, once. Returns the existing row if it was already
 * settled, and NULL if the day has not closed yet.
 */
create or replace function public.settle_day(p_couple_id uuid, p_local_date date)
returns public.day_results
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.day_results;
  v_scheduled integer;
  v_scores jsonb;
  v_winner uuid;
  v_best integer;
  v_leaders integer;
begin
  select * into v_row from public.day_results r
    where r.couple_id = p_couple_id and r.local_date = p_local_date;
  if v_row.couple_id is not null then
    return v_row;  -- already settled, and never recomputed
  end if;

  if public.couple_day_closes_at(p_couple_id, p_local_date) > now() then
    return null;   -- the day is still being lived
  end if;

  with scheduled as (
    select t.id, t.target_count
    from public.tasks t
    where t.couple_id = p_couple_id
      and t.archived_at is null
      and public.task_scheduled_on(t.schedule_kind, t.weekdays, t.due_date, p_local_date)
  ),
  members as (
    select m.user_id from public.couple_members m
    where m.couple_id = p_couple_id and m.left_at is null
  ),
  per_user as (
    select
      mem.user_id,
      count(*) filter (
        where coalesce(tc.count, 0) >= coalesce(s.target_count, 1)
      )::integer as done
    from members mem
    cross join scheduled s
    left join public.task_completions tc
      on tc.task_id = s.id and tc.user_id = mem.user_id and tc.local_date = p_local_date
    group by mem.user_id
  )
  select
    (select count(*) from scheduled),
    coalesce(jsonb_object_agg(pu.user_id, pu.done), '{}'::jsonb)
  into v_scheduled, v_scores
  from per_user pu;

  -- Everyone is in `scores`, including a partner who did nothing, so the screens
  -- never have to guess at a missing key.
  if v_scores = '{}'::jsonb then
    select coalesce(jsonb_object_agg(m.user_id, 0), '{}'::jsonb) into v_scores
    from public.couple_members m
    where m.couple_id = p_couple_id and m.left_at is null;
  end if;

  select max(value::integer) into v_best from jsonb_each_text(v_scores);
  select count(*) into v_leaders from jsonb_each_text(v_scores) where value::integer = v_best;

  -- One clear leader takes the day. Anything else — including both on nothing — is a tie.
  if v_leaders = 1 and coalesce(v_best, 0) > 0 then
    select key::uuid into v_winner from jsonb_each_text(v_scores) where value::integer = v_best;
  else
    v_winner := null;
  end if;

  insert into public.day_results (
    couple_id, local_date, scheduled_count, scores, winner_user_id, both_complete
  )
  values (
    p_couple_id,
    p_local_date,
    coalesce(v_scheduled, 0),
    v_scores,
    v_winner,
    coalesce(v_scheduled, 0) > 0
      and not exists (
        select 1 from jsonb_each_text(v_scores) where value::integer < v_scheduled
      )
  )
  on conflict (couple_id, local_date) do nothing
  returning * into v_row;

  if v_row.couple_id is null then
    select * into v_row from public.day_results r
      where r.couple_id = p_couple_id and r.local_date = p_local_date;
  end if;

  -- Any challenge still open when the day closed has run out of time.
  update public.completion_challenges
    set status = 'stood_by', resolved_at = now()
    where couple_id = p_couple_id and local_date = p_local_date and status = 'open';

  return v_row;
end;
$$;

/*
 * Settles every day that has closed and is not settled yet, newest first.
 * Called whenever the app loads a screen that shows results, so the app works
 * with no scheduled job at all; the job is only a backstop.
 */
create or replace function public.settle_due_days(p_couple_id uuid, p_max_days integer default 60)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_date date;
  v_first date;
  v_last date;
  v_count integer := 0;
begin
  -- Nothing to settle before the couple existed, or after the last closed day.
  select (c.created_at at time zone c.time_zone)::date into v_first
  from public.couples c where c.id = p_couple_id;
  if v_first is null then
    return 0;
  end if;

  v_last := public.couple_active_date(p_couple_id) - 1;
  v_first := greatest(v_first, v_last - (greatest(p_max_days, 1) - 1));

  v_date := v_last;
  while v_date >= v_first loop
    if not exists (
      select 1 from public.day_results r
      where r.couple_id = p_couple_id and r.local_date = v_date
    ) then
      perform public.settle_day(p_couple_id, v_date);
      -- Checked by looking for the row rather than by testing the returned
      -- record: a tie has a NULL winner, which would make the whole composite
      -- read as NULL.
      if exists (
        select 1 from public.day_results r
        where r.couple_id = p_couple_id and r.local_date = v_date
      ) then
        v_count := v_count + 1;
      end if;
    end if;
    v_date := v_date - 1;
  end loop;

  return v_count;
end;
$$;

-- Settles every couple that has days owing. Meant for a scheduled job; also the
-- thing that keeps a free-tier project from pausing.
create or replace function public.settle_all_due_days()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_total integer := 0;
  v_couple uuid;
begin
  for v_couple in
    select c.id from public.couples c where c.unlinked_at is null
  loop
    v_total := v_total + public.settle_due_days(v_couple, 7);
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges
--
-- Logs are trusted. A challenge is a question, not a veto: raising one never
-- removes your partner's log, it only asks them about it before the day closes.
-- Only the person who logged it can clear it.
-- ---------------------------------------------------------------------------

create or replace function public.raise_challenge(
  p_task_id uuid,
  p_local_date date,
  p_reason text default ''
)
returns public.completion_challenges
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_partner uuid := public.partner_id(v_couple);
  v_row public.completion_challenges;
begin
  if v_partner is null then
    raise exception 'you have no partner to challenge' using errcode = 'P0001';
  end if;
  if public.couple_day_closes_at(v_couple, p_local_date) <= now() then
    raise exception 'that day has already closed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.tasks t where t.id = p_task_id and t.couple_id = v_couple
  ) then
    raise exception 'that task is not on your list' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.task_completions tc
    where tc.task_id = p_task_id and tc.user_id = v_partner and tc.local_date = p_local_date
  ) then
    raise exception 'there is nothing logged there to ask about' using errcode = 'P0001';
  end if;

  insert into public.completion_challenges (
    couple_id, task_id, challenged_user_id, local_date, raised_by, reason
  )
  values (v_couple, p_task_id, v_partner, p_local_date, auth.uid(), left(coalesce(p_reason, ''), 500))
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'you have already asked about that one' using errcode = 'P0001';
end;
$$;

-- Loads an open challenge the caller is entitled to answer. p_as_logger picks
-- which side of it the caller must be on.
create or replace function public.lock_open_challenge(p_id uuid, p_as_logger boolean)
returns public.completion_challenges
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_row public.completion_challenges;
begin
  select * into v_row from public.completion_challenges c
    where c.id = p_id and c.couple_id = v_couple
    for update;

  if v_row.id is null then
    raise exception 'that question does not exist' using errcode = 'P0001';
  end if;
  if v_row.status <> 'open' then
    raise exception 'that question was already answered' using errcode = 'P0001';
  end if;
  if p_as_logger and v_row.challenged_user_id <> auth.uid() then
    raise exception 'only the partner who logged it can answer that' using errcode = 'P0001';
  end if;
  if not p_as_logger and v_row.raised_by <> auth.uid() then
    raise exception 'only the partner who asked can take it back' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

-- "You're right" — the log is cleared, by the person who made it.
create or replace function public.concede_challenge(p_id uuid)
returns public.completion_challenges
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.completion_challenges := public.lock_open_challenge(p_id, true);
begin
  delete from public.task_completions
    where task_id = v_row.task_id
      and user_id = v_row.challenged_user_id
      and local_date = v_row.local_date;

  update public.completion_challenges
    set status = 'conceded', resolved_at = now()
    where id = p_id
    returning * into v_row;

  return v_row;
end;
$$;

-- "No, I did it" — the log stands, because logs are trusted.
create or replace function public.stand_by_log(p_id uuid)
returns public.completion_challenges
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.completion_challenges := public.lock_open_challenge(p_id, true);
begin
  update public.completion_challenges
    set status = 'stood_by', resolved_at = now()
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.withdraw_challenge(p_id uuid)
returns public.completion_challenges
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.completion_challenges := public.lock_open_challenge(p_id, false);
begin
  update public.completion_challenges
    set status = 'withdrawn', resolved_at = now()
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Both tables are readable by the couple and writable only through the
-- functions above, the same shape as tasks and proposals.
-- ---------------------------------------------------------------------------

alter table public.day_results            enable row level security;
alter table public.completion_challenges  enable row level security;

create policy day_results_select_own_couple on public.day_results
  for select to authenticated
  using (couple_id = public.current_couple_id());

create policy challenges_select_own_couple on public.completion_challenges
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- Supabase grants the API roles access to newly created public tables by
-- default, so these two have to be shut again before being opened for reads
-- only. Without this, a partner could edit a settled day by hand.
revoke all on public.day_results           from anon, authenticated;
revoke all on public.completion_challenges from anon, authenticated;

grant select on public.day_results           to authenticated;
grant select on public.completion_challenges to authenticated;

grant execute on function public.couple_active_date(uuid, timestamptz)       to authenticated;
grant execute on function public.couple_day_closes_at(uuid, date)            to authenticated;
grant execute on function public.settle_day(uuid, date)                      to authenticated;
grant execute on function public.settle_due_days(uuid, integer)              to authenticated;
grant execute on function public.raise_challenge(uuid, date, text)           to authenticated;
grant execute on function public.concede_challenge(uuid)                     to authenticated;
grant execute on function public.stand_by_log(uuid)                          to authenticated;
grant execute on function public.withdraw_challenge(uuid)                    to authenticated;

-- ---------------------------------------------------------------------------
-- Logging now follows the agreed day, not the calendar
-- ---------------------------------------------------------------------------

-- Replaces the version that defaulted to the calendar date: a completion logged
-- after the end-of-day time belongs to tomorrow, which is what "tomorrow's list
-- opens" means. A closed day can no longer be edited at all.
create or replace function public.set_completion(
  p_task_id uuid,
  p_count integer default 1,
  p_local_date date default null
)
returns public.task_completions
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_date date := coalesce(p_local_date, public.couple_active_date(v_couple));
  v_row public.task_completions;
begin
  if p_count is null or p_count < 0 then
    raise exception 'count cannot be negative' using errcode = 'P0001';
  end if;
  if public.couple_day_closes_at(v_couple, v_date) <= now() then
    raise exception 'that day has closed' using errcode = 'P0001';
  end if;

  if p_count = 0 then
    delete from public.task_completions
      where task_id = p_task_id and user_id = auth.uid() and local_date = v_date;
    return null;
  end if;

  insert into public.task_completions (couple_id, task_id, user_id, local_date, count)
  values (v_couple, p_task_id, auth.uid(), v_date, p_count)
  on conflict (task_id, user_id, local_date)
    do update set count = excluded.count, completed_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
