-- Knitty Maa Manager — cloud sync schema.
-- Run once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.records (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  collection  text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null,           -- when the record was last edited (device clock)
  deleted     boolean     not null default false,
  synced_at   timestamptz not null default clock_timestamp(), -- server clock, used as pull cursor
  primary key (user_id, id)
);

create index if not exists records_user_synced_idx on public.records (user_id, synced_at);

-- Last write wins: ignore an upload that is older than what the server already has,
-- and always stamp synced_at with the server clock.
create or replace function public.records_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

-- Each signed-in user can only see and change their own rows.
alter table public.records enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
