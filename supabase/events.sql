-- zaproszenia: one backend for every client invite.
-- Run once in Supabase → SQL editor (safe to run again). Builds on the
-- birthday invite's schema (events, rsvps, host_rsvps, host_delete_rsvp).

-- each event knows its own site and the name its emails come from,
-- so a new client is one new row: no code change, no redeploy
alter table public.events add column if not exists site text;
alter table public.events add column if not exists sender text;
alter table public.events add column if not exists event_date date;
alter table public.events alter column owner_id drop not null;

update public.events
   set site = 'https://urodziny.cotoaleksandra.com',
       sender = 'Ola · Septem of Swords',
       event_date = '2026-12-12'
 where slug = 'ola-urodziny-2026' and site is null;

-- privacy: guests' replies (names, emails, messages) are deleted
-- 30 days after the event; the event row itself stays
create or replace function public.purge_old_rsvps()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.rsvps r using public.events e
   where r.event_id = e.id and e.event_date is not null and e.event_date < current_date - 30;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_old_rsvps() from public, anon, authenticated;

-- run it every night at 03:00 UTC
create extension if not exists pg_cron;
select cron.unschedule('purge-old-rsvps') where exists (select 1 from cron.job where jobname = 'purge-old-rsvps');
select cron.schedule('purge-old-rsvps', '0 3 * * *', 'select public.purge_old_rsvps()');

select slug, site, sender, event_date from public.events order by created_at;
