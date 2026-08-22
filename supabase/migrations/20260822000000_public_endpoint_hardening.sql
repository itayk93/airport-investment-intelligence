create table if not exists public.rate_limit_hits (
  bucket text not null,
  hit_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_bucket_hit_at_idx
  on public.rate_limit_hits (bucket, hit_at desc);

alter table public.rate_limit_hits enable row level security;
revoke all on table public.rate_limit_hits from public, anon, authenticated;

create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_hits integer;
begin
  if p_bucket is null or length(p_bucket) > 128 or p_limit < 1
     or p_window <= interval '0 seconds' or p_window > interval '7 days' then
    raise exception 'invalid rate-limit parameters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));

  select count(*) into current_hits
  from public.rate_limit_hits
  where bucket = p_bucket and hit_at > clock_timestamp() - p_window;

  if current_hits >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, interval) from public;
grant execute on function public.check_rate_limit(text, integer, interval) to agent_reader;

create or replace function public.cleanup_rate_limit_hits() returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.rate_limit_hits where hit_at < now() - interval '8 days';
$$;

revoke all on function public.cleanup_rate_limit_hits() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'cleanup-rate-limit-hits') then
      perform cron.schedule(
        'cleanup-rate-limit-hits',
        '17 3 * * *',
        'select public.cleanup_rate_limit_hits()'
      );
    end if;
  end if;
end;
$$;
