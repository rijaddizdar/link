-- Link: couples app foundation.
-- Core objects: profiles, couples, invite codes, tasks, task proposals, completions.
-- All shared mutations go through SECURITY DEFINER functions so that partner approval
-- and membership rules are enforced by the database, not only by the UI.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.schedule_kind as enum ('daily', 'weekdays', 'once');
create type public.proposal_kind as enum ('create', 'edit', 'delete');
create type public.proposal_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------

-- A proposal the partner never answers expires after this long.
create or replace function public.proposal_ttl() returns interval
  language sql immutable parallel safe as $$ select interval '7 days' $$;

-- An invite code that is never redeemed stops working after this long.
create or replace function public.invite_code_ttl() returns interval
  language sql immutable parallel safe as $$ select interval '7 days' $$;

-- After an unlink, shared history is kept this long so the couple can undo it,
-- then purged. Documented in docs/SPEC.md.
create or replace function public.unlink_grace_period() returns interval
  language sql immutable parallel safe as $$ select interval '30 days' $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

create table public.couples (
  id                 uuid primary key default gen_random_uuid(),
  -- IANA time zone shared by the couple; fixes which calendar day a completion lands on.
  time_zone          text not null,
  created_at         timestamptz not null default now(),
  unlinked_at        timestamptz,
  unlinked_by        uuid references auth.users (id) on delete set null,
  -- Shared history is deleted after this instant once unlinked.
  purge_after        timestamptz,
  constraint couples_unlink_fields_agree check (
    (unlinked_at is null and purge_after is null)
    or (unlinked_at is not null and purge_after is not null)
  )
);

create table public.couple_members (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (couple_id, user_id)
);

-- A user can belong to at most one *active* couple at a time.
create unique index couple_members_one_active_couple
  on public.couple_members (user_id)
  where left_at is null;

create table public.invite_codes (
  code       text primary key,
  couple_id  uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

create index invite_codes_couple_idx on public.invite_codes (couple_id);

-- Only *adopted* tasks live here: a task reaches this table once both partners agree.
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 120),
  description   text not null default '' check (length(description) <= 2000),
  emoji         text not null default '💞' check (length(emoji) <= 8),
  color         text not null default 'blush'
                  check (color in ('blush','coral','plum','rose','berry','peach','lilac','mint')),
  schedule_kind public.schedule_kind not null,
  -- ISO weekdays (1 = Monday .. 7 = Sunday), only for schedule_kind = 'weekdays'.
  weekdays      smallint[] not null default '{}',
  -- Couple-local date, only for schedule_kind = 'once'.
  due_date      date,
  -- Optional numeric goal, e.g. 8 glasses of water. NULL means a simple done/not-done task.
  target_count  integer check (target_count is null or target_count between 1 and 10000),
  created_by    uuid not null references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint tasks_schedule_shape check (
    case schedule_kind
      when 'weekdays' then array_length(weekdays, 1) between 1 and 7 and due_date is null
      when 'once'     then due_date is not null and weekdays = '{}'
      else due_date is null and weekdays = '{}'
    end
  ),
  constraint tasks_weekdays_in_range check (
    weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

create index tasks_couple_idx on public.tasks (couple_id) where archived_at is null;

-- A create / edit / delete awaiting the other partner's approval.
create table public.task_proposals (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  -- NULL for 'create': the task does not exist yet.
  task_id     uuid references public.tasks (id) on delete cascade,
  kind        public.proposal_kind not null,
  -- Task fields being proposed, same shape for create and edit. Empty for delete.
  payload     jsonb not null default '{}'::jsonb,
  note        text not null default '' check (length(note) <= 500),
  proposed_by uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  status      public.proposal_status not null default 'pending',
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  -- A 'create' has no task until it is approved, at which point the approval
  -- records which task it produced. Edits and deletes always name a task.
  constraint task_proposals_task_ref check (
    case kind
      when 'create' then status = 'approved' or task_id is null
      else task_id is not null
    end
  ),
  constraint task_proposals_resolution check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
);

-- At most one open proposal per existing task, and one open create per proposer+title
-- is not enforced on purpose: duplicate creates are harmless and easy to reject.
create unique index task_proposals_one_pending_per_task
  on public.task_proposals (task_id)
  where status = 'pending' and task_id is not null;

create index task_proposals_couple_status_idx on public.task_proposals (couple_id, status);

-- One row per task per partner per couple-local day.
create table public.task_completions (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The couple's local calendar date this completion counts for. Daily scoring
  -- (a later PR) groups by this column.
  local_date   date not null,
  -- Progress toward tasks.target_count; 1 for a simple done/not-done task.
  count        integer not null default 1 check (count >= 0),
  completed_at timestamptz not null default now(),
  unique (task_id, user_id, local_date)
);

create index task_completions_couple_date_idx on public.task_completions (couple_id, local_date);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller's active couple, or NULL. SECURITY DEFINER so that RLS policies can
-- use it without recursing into couple_members' own policies.
create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select m.couple_id
  from public.couple_members m
  join public.couples c on c.id = m.couple_id
  where m.user_id = auth.uid()
    and m.left_at is null
    and c.unlinked_at is null
  limit 1
$$;

create or replace function public.couple_local_date(p_couple_id uuid, p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select (p_at at time zone c.time_zone)::date
  from public.couples c
  where c.id = p_couple_id
$$;

-- Raises unless the caller is in an active couple; returns that couple id.
create or replace function public.require_couple()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.current_couple_id();
begin
  if v_couple is null then
    raise exception 'not linked to a partner' using errcode = 'P0001';
  end if;
  return v_couple;
end;
$$;

create or replace function public.partner_id(p_couple_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select m.user_id
  from public.couple_members m
  where m.couple_id = p_couple_id
    and m.left_at is null
    and m.user_id <> auth.uid()
  limit 1
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- A new auth user gets a profile row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Shape of the rules:
--   * A user with no active couple can see their own profile and nothing shared.
--   * Everything couple-scoped is gated on current_couple_id().
--   * tasks and task_proposals have NO direct write policies: creates, edits and
--     deletes must go through the propose_* / approve_* functions below so that
--     partner approval cannot be bypassed by talking to the API directly.
--   * task_completions are writable only for your own rows, but readable for both
--     partners — that is what makes the side-by-side view work.
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.couples          enable row level security;
alter table public.couple_members   enable row level security;
alter table public.invite_codes     enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_proposals   enable row level security;
alter table public.task_completions enable row level security;

-- profiles -------------------------------------------------------------------

create policy profiles_select_self_or_partner on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or id in (
      select m.user_id from public.couple_members m
      where m.couple_id = public.current_couple_id() and m.left_at is null
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- couples --------------------------------------------------------------------

-- Includes couples already unlinked but still inside the grace window, so the
-- "undo unlink" screen can find them.
create policy couples_select_member on public.couples
  for select to authenticated
  using (
    id in (select m.couple_id from public.couple_members m where m.user_id = auth.uid())
  );

-- Time zone changes are allowed for members; unlink/purge columns are driven by
-- functions only, which is enforced by the trigger below.
create policy couples_update_member on public.couples
  for update to authenticated
  using (id = public.current_couple_id())
  with check (id = public.current_couple_id());

create or replace function public.guard_couple_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.unlinked_at is distinct from old.unlinked_at
       or new.unlinked_by is distinct from old.unlinked_by
       or new.purge_after is distinct from old.purge_after
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'unlink state can only change through request_unlink()/restore_link()'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger couples_guard_update
  before update on public.couples
  for each row execute function public.guard_couple_update();

-- couple_members -------------------------------------------------------------

create policy couple_members_select_own_couple on public.couple_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or couple_id = public.current_couple_id()
  );

-- invite_codes ---------------------------------------------------------------
-- A code is readable only by the couple that owns it. The partner redeeming a
-- code cannot read the row, so redemption goes through redeem_invite_code().

create policy invite_codes_select_own_couple on public.invite_codes
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- tasks ----------------------------------------------------------------------

create policy tasks_select_own_couple on public.tasks
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- task_proposals -------------------------------------------------------------

create policy task_proposals_select_own_couple on public.task_proposals
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- task_completions -----------------------------------------------------------

create policy task_completions_select_own_couple on public.task_completions
  for select to authenticated
  using (couple_id = public.current_couple_id());

create policy task_completions_insert_own on public.task_completions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and couple_id = public.current_couple_id()
    and task_id in (
      select t.id from public.tasks t
      where t.couple_id = public.current_couple_id() and t.archived_at is null
    )
  );

create policy task_completions_update_own on public.task_completions
  for update to authenticated
  using (user_id = auth.uid() and couple_id = public.current_couple_id())
  with check (user_id = auth.uid() and couple_id = public.current_couple_id());

create policy task_completions_delete_own on public.task_completions
  for delete to authenticated
  using (user_id = auth.uid() and couple_id = public.current_couple_id());

-- Grants: RLS does the row filtering, these grants decide which verbs exist at all.
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update on public.profiles         to authenticated;
grant select, update          on public.couples          to authenticated;
grant select                  on public.couple_members   to authenticated;
grant select                  on public.invite_codes     to authenticated;
grant select                  on public.tasks            to authenticated;
grant select                  on public.task_proposals   to authenticated;
grant select, insert, update, delete on public.task_completions to authenticated;

-- ---------------------------------------------------------------------------
-- Linking
-- ---------------------------------------------------------------------------

-- Codes use an alphabet without 0/O/1/I/L so they survive being read aloud.
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try int := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes ic where ic.code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'could not allocate an invite code' using errcode = 'P0001';
    end if;
  end loop;
  return v_code;
end;
$$;

-- Creates the couple (with the shared time zone) on first call and returns a
-- fresh code, revoking any code the caller had outstanding.
create or replace function public.generate_invite_code(p_time_zone text)
returns public.invite_codes
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_couple uuid;
  v_members int;
  v_row public.invite_codes;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'P0001';
  end if;
  if p_time_zone is null or not exists (select 1 from pg_timezone_names n where n.name = p_time_zone) then
    raise exception 'unknown time zone: %', coalesce(p_time_zone, '(null)') using errcode = 'P0001';
  end if;

  v_couple := public.current_couple_id();

  if v_couple is null then
    insert into public.couples (time_zone) values (p_time_zone) returning id into v_couple;
    insert into public.couple_members (couple_id, user_id) values (v_couple, v_uid);
  else
    select count(*) into v_members
    from public.couple_members m
    where m.couple_id = v_couple and m.left_at is null;

    if v_members >= 2 then
      raise exception 'you are already linked with a partner' using errcode = 'P0001';
    end if;

    update public.couples set time_zone = p_time_zone where id = v_couple;
  end if;

  update public.invite_codes
    set revoked_at = now()
    where couple_id = v_couple and redeemed_at is null and revoked_at is null;

  insert into public.invite_codes (code, couple_id, created_by, expires_at)
  values (public.new_invite_code(), v_couple, v_uid, now() + public.invite_code_ttl())
  returning * into v_row;

  return v_row;
end;
$$;

-- What the person entering a code is allowed to learn before committing.
create or replace function public.peek_invite_code(p_code text)
returns table (display_name text, time_zone text)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  return query
  select p.display_name, c.time_zone
  from public.invite_codes ic
  join public.couples c on c.id = ic.couple_id
  join public.profiles p on p.id = ic.created_by
  where ic.code = v_code
    and ic.redeemed_at is null
    and ic.revoked_at is null
    and ic.expires_at > now()
    and c.unlinked_at is null
    and ic.created_by <> auth.uid();
end;
$$;

create or replace function public.redeem_invite_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite public.invite_codes;
  v_members int;
  v_own uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'P0001';
  end if;

  v_own := public.current_couple_id();
  if v_own is not null and exists (
    select 1 from public.couple_members m
    where m.couple_id = v_own and m.left_at is null and m.user_id <> v_uid
  ) then
    raise exception 'you are already linked with a partner' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invite_codes ic
  where ic.code = v_code
  for update;

  if v_invite.code is null then
    raise exception 'that code does not exist' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'that code was replaced by a newer one' using errcode = 'P0001';
  end if;
  if v_invite.redeemed_at is not null then
    raise exception 'that code has already been used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'that code has expired' using errcode = 'P0001';
  end if;
  if v_invite.created_by = v_uid then
    raise exception 'that is your own code — share it with your partner' using errcode = 'P0001';
  end if;

  select count(*) into v_members
  from public.couple_members m
  where m.couple_id = v_invite.couple_id and m.left_at is null;

  if v_members >= 2 then
    raise exception 'that couple is already complete' using errcode = 'P0001';
  end if;

  -- Leave the solo couple the caller may have created for themselves; it holds
  -- nothing shared yet, so it is removed outright.
  if v_own is not null then
    delete from public.couple_members where couple_id = v_own and user_id = v_uid;
    delete from public.couples c
      where c.id = v_own
        and not exists (select 1 from public.couple_members m where m.couple_id = c.id);
  end if;

  insert into public.couple_members (couple_id, user_id)
  values (v_invite.couple_id, v_uid)
  on conflict (couple_id, user_id) do update set left_at = null;

  update public.invite_codes
    set redeemed_at = now(), redeemed_by = v_uid
    where code = v_invite.code;

  return v_invite.couple_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unlink / restore / purge
-- ---------------------------------------------------------------------------

create or replace function public.request_unlink()
returns public.couples
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_row public.couples;
begin
  update public.couples
    set unlinked_at = now(),
        unlinked_by = auth.uid(),
        purge_after = now() + public.unlink_grace_period()
    where id = v_couple
    returning * into v_row;

  update public.couple_members set left_at = now()
    where couple_id = v_couple and left_at is null;

  update public.invite_codes set revoked_at = now()
    where couple_id = v_couple and redeemed_at is null and revoked_at is null;

  update public.task_proposals
    set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
    where couple_id = v_couple and status = 'pending';

  return v_row;
end;
$$;

-- Undo an unlink inside the grace window, as long as neither ex-partner has
-- linked up with someone else in the meantime.
create or replace function public.restore_link(p_couple_id uuid)
returns public.couples
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.couples;
  v_blocked int;
begin
  select * into v_row from public.couples c
    where c.id = p_couple_id and c.unlinked_at is not null for update;

  if v_row.id is null then
    raise exception 'nothing to restore' using errcode = 'P0001';
  end if;
  if v_row.purge_after <= now() then
    raise exception 'the grace period for this link has passed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.couple_members m where m.couple_id = p_couple_id and m.user_id = v_uid
  ) then
    raise exception 'you were not part of that link' using errcode = 'P0001';
  end if;

  select count(*) into v_blocked
  from public.couple_members m
  join public.couple_members other on other.user_id = m.user_id and other.left_at is null
  join public.couples oc on oc.id = other.couple_id and oc.unlinked_at is null
  where m.couple_id = p_couple_id and other.couple_id <> p_couple_id;

  if v_blocked > 0 then
    raise exception 'one of you has since linked with someone else' using errcode = 'P0001';
  end if;

  update public.couples
    set unlinked_at = null, unlinked_by = null, purge_after = null
    where id = p_couple_id
    returning * into v_row;

  update public.couple_members set left_at = null where couple_id = p_couple_id;

  return v_row;
end;
$$;

-- Deletes couples whose grace period has run out, taking their shared history
-- with them. Safe to call from anywhere; intended for a scheduled job.
create or replace function public.purge_expired_couples()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted integer;
begin
  with gone as (
    delete from public.couples
    where unlinked_at is not null and purge_after <= now()
    returning id
  )
  select count(*) into v_deleted from gone;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task proposals and approval
-- ---------------------------------------------------------------------------

-- Normalises and validates the task fields carried by a create/edit proposal.
create or replace function public.normalize_task_payload(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_kind text := coalesce(p ->> 'schedule_kind', '');
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_weekdays smallint[];
  v_target integer;
  v_due date;
begin
  if length(v_title) = 0 or length(v_title) > 120 then
    raise exception 'a task needs a title of 1–120 characters' using errcode = 'P0001';
  end if;
  if v_kind not in ('daily', 'weekdays', 'once') then
    raise exception 'schedule must be daily, weekdays or once' using errcode = 'P0001';
  end if;

  if v_kind = 'weekdays' then
    select coalesce(array_agg(distinct d order by d), '{}')::smallint[]
      into v_weekdays
    from jsonb_array_elements_text(coalesce(p -> 'weekdays', '[]'::jsonb)) as e(d_text)
    cross join lateral (select e.d_text::smallint as d) s;
    if array_length(v_weekdays, 1) is null then
      raise exception 'pick at least one weekday' using errcode = 'P0001';
    end if;
    if not (v_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]) then
      raise exception 'weekdays must be 1 (Monday) through 7 (Sunday)' using errcode = 'P0001';
    end if;
  else
    v_weekdays := '{}'::smallint[];
  end if;

  if v_kind = 'once' then
    v_due := nullif(p ->> 'due_date', '')::date;
    if v_due is null then
      raise exception 'a one-time task needs a date' using errcode = 'P0001';
    end if;
  end if;

  v_target := nullif(p ->> 'target_count', '')::integer;
  if v_target is not null and (v_target < 1 or v_target > 10000) then
    raise exception 'a target must be between 1 and 10000' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'title', v_title,
    'description', left(coalesce(p ->> 'description', ''), 2000),
    'emoji', coalesce(nullif(p ->> 'emoji', ''), '💞'),
    'color', coalesce(nullif(p ->> 'color', ''), 'blush'),
    'schedule_kind', v_kind,
    'weekdays', to_jsonb(v_weekdays),
    'due_date', v_due,
    'target_count', v_target
  );
end;
$$;

-- Flips pending proposals whose 7-day window has closed. Called at the start of
-- every proposal read and write so the state is never stale, and available for a
-- scheduled job.
create or replace function public.expire_stale_proposals()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.task_proposals
      set status = 'expired', resolved_at = now()
      where status = 'pending' and expires_at <= now()
      returning id
  )
  select count(*) into v_count from stale;
  return v_count;
end;
$$;

create or replace function public.propose_task(p_payload jsonb, p_note text default '')
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_row public.task_proposals;
begin
  perform public.expire_stale_proposals();

  insert into public.task_proposals (couple_id, kind, payload, note, proposed_by, expires_at)
  values (
    v_couple, 'create', public.normalize_task_payload(p_payload),
    left(coalesce(p_note, ''), 500), auth.uid(), now() + public.proposal_ttl()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.propose_task_edit(p_task_id uuid, p_payload jsonb, p_note text default '')
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_row public.task_proposals;
begin
  perform public.expire_stale_proposals();

  if not exists (
    select 1 from public.tasks t
    where t.id = p_task_id and t.couple_id = v_couple and t.archived_at is null
  ) then
    raise exception 'that task is not on your list' using errcode = 'P0001';
  end if;

  insert into public.task_proposals (couple_id, task_id, kind, payload, note, proposed_by, expires_at)
  values (
    v_couple, p_task_id, 'edit', public.normalize_task_payload(p_payload),
    left(coalesce(p_note, ''), 500), auth.uid(), now() + public.proposal_ttl()
  )
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'that task already has a change waiting for approval' using errcode = 'P0001';
end;
$$;

create or replace function public.propose_task_delete(p_task_id uuid, p_note text default '')
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_row public.task_proposals;
begin
  perform public.expire_stale_proposals();

  if not exists (
    select 1 from public.tasks t
    where t.id = p_task_id and t.couple_id = v_couple and t.archived_at is null
  ) then
    raise exception 'that task is not on your list' using errcode = 'P0001';
  end if;

  insert into public.task_proposals (couple_id, task_id, kind, note, proposed_by, expires_at)
  values (v_couple, p_task_id, 'delete', left(coalesce(p_note, ''), 500), auth.uid(), now() + public.proposal_ttl())
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'that task already has a change waiting for approval' using errcode = 'P0001';
end;
$$;

-- Loads a pending proposal the caller is entitled to answer. p_as_proposer picks
-- which side of the proposal the caller must be on.
create or replace function public.lock_pending_proposal(p_id uuid, p_as_proposer boolean)
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_couple uuid := public.require_couple();
  v_row public.task_proposals;
begin
  select * into v_row from public.task_proposals tp
    where tp.id = p_id and tp.couple_id = v_couple
    for update;

  if v_row.id is null then
    raise exception 'that proposal does not exist' using errcode = 'P0001';
  end if;
  if v_row.expires_at <= now() and v_row.status = 'pending' then
    update public.task_proposals set status = 'expired', resolved_at = now() where id = p_id;
    raise exception 'that proposal expired before it was answered' using errcode = 'P0001';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'that proposal was already %', v_row.status using errcode = 'P0001';
  end if;

  if p_as_proposer and v_row.proposed_by <> auth.uid() then
    raise exception 'only the partner who proposed this can withdraw it' using errcode = 'P0001';
  end if;
  -- The whole point of approval: you cannot wave through your own proposal.
  if not p_as_proposer and v_row.proposed_by = auth.uid() then
    raise exception 'your partner has to approve this one' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

create or replace function public.approve_proposal(p_id uuid)
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_p public.task_proposals := public.lock_pending_proposal(p_id, false);
  v_payload jsonb := v_p.payload;
begin
  if v_p.kind = 'create' then
    insert into public.tasks (
      couple_id, title, description, emoji, color,
      schedule_kind, weekdays, due_date, target_count, created_by
    )
    values (
      v_p.couple_id,
      v_payload ->> 'title',
      coalesce(v_payload ->> 'description', ''),
      coalesce(v_payload ->> 'emoji', '💞'),
      coalesce(v_payload ->> 'color', 'blush'),
      (v_payload ->> 'schedule_kind')::public.schedule_kind,
      coalesce((
        select array_agg(e::smallint) from jsonb_array_elements_text(v_payload -> 'weekdays') e
      ), '{}')::smallint[],
      nullif(v_payload ->> 'due_date', '')::date,
      nullif(v_payload ->> 'target_count', '')::integer,
      v_p.proposed_by
    )
    returning id into v_p.task_id;

  elsif v_p.kind = 'edit' then
    update public.tasks set
      title         = v_payload ->> 'title',
      description   = coalesce(v_payload ->> 'description', ''),
      emoji         = coalesce(v_payload ->> 'emoji', '💞'),
      color         = coalesce(v_payload ->> 'color', 'blush'),
      schedule_kind = (v_payload ->> 'schedule_kind')::public.schedule_kind,
      weekdays      = coalesce((
        select array_agg(e::smallint) from jsonb_array_elements_text(v_payload -> 'weekdays') e
      ), '{}')::smallint[],
      due_date      = nullif(v_payload ->> 'due_date', '')::date,
      target_count  = nullif(v_payload ->> 'target_count', '')::integer
    where id = v_p.task_id;

  elsif v_p.kind = 'delete' then
    -- Archived rather than removed, so completion history stays intact for the
    -- scoring and calendar work in a later PR.
    update public.tasks set archived_at = now() where id = v_p.task_id;
  end if;

  update public.task_proposals
    set status = 'approved', resolved_by = auth.uid(), resolved_at = now(),
        task_id = v_p.task_id
    where id = p_id
    returning * into v_p;

  return v_p;
end;
$$;

create or replace function public.reject_proposal(p_id uuid)
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_p public.task_proposals := public.lock_pending_proposal(p_id, false);
begin
  update public.task_proposals
    set status = 'rejected', resolved_by = auth.uid(), resolved_at = now()
    where id = p_id
    returning * into v_p;
  return v_p;
end;
$$;

create or replace function public.cancel_proposal(p_id uuid)
returns public.task_proposals
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_p public.task_proposals := public.lock_pending_proposal(p_id, true);
begin
  update public.task_proposals
    set status = 'cancelled', resolved_by = auth.uid(), resolved_at = now()
    where id = p_id
    returning * into v_p;
  return v_p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Completion logging
-- ---------------------------------------------------------------------------

-- Sets the caller's own progress on a task for a couple-local day. p_count of 0
-- clears the log. Runs as the caller, so RLS keeps it to their own rows.
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
  v_date date := coalesce(p_local_date, public.couple_local_date(v_couple));
  v_row public.task_completions;
begin
  if p_count is null or p_count < 0 then
    raise exception 'count cannot be negative' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from anon, authenticated;

grant execute on function public.current_couple_id()                      to authenticated;
grant execute on function public.couple_local_date(uuid, timestamptz)     to authenticated;
grant execute on function public.partner_id(uuid)                        to authenticated;
grant execute on function public.require_couple()                        to authenticated;
grant execute on function public.generate_invite_code(text)              to authenticated;
grant execute on function public.peek_invite_code(text)                  to authenticated;
grant execute on function public.redeem_invite_code(text)                to authenticated;
grant execute on function public.request_unlink()                        to authenticated;
grant execute on function public.restore_link(uuid)                      to authenticated;
grant execute on function public.expire_stale_proposals()                to authenticated;
grant execute on function public.propose_task(jsonb, text)               to authenticated;
grant execute on function public.propose_task_edit(uuid, jsonb, text)    to authenticated;
grant execute on function public.propose_task_delete(uuid, text)         to authenticated;
grant execute on function public.approve_proposal(uuid)                  to authenticated;
grant execute on function public.reject_proposal(uuid)                   to authenticated;
grant execute on function public.cancel_proposal(uuid)                   to authenticated;
grant execute on function public.set_completion(uuid, integer, date)     to authenticated;
