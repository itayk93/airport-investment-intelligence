create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup-rate-limit-hits') then
    perform cron.schedule(
      'cleanup-rate-limit-hits',
      '17 3 * * *',
      'select public.cleanup_rate_limit_hits()'
    );
  end if;
end;
$$;
