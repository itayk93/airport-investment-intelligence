-- WhatsApp follow-up questions.
--
-- The web chat sends its own history with every request, so follow-ups work there. Twilio
-- sends one message with no history, so the WhatsApp channel was answering every question
-- cold: "compare LAX and SNA" then "why?" reached the agent as an isolated "why?". The
-- assignment asks specifically for conversational follow-up, so the channel needs a short
-- server-side memory.
--
-- Deliberately minimal and short-lived. The row key is the salted SHA-256 of the sender's
-- WhatsApp number, never the number itself, so this table cannot be used to work out who
-- asked anything. Turns expire after two hours and a daily job deletes them.

create table if not exists public.whatsapp_turns (
  conversation_hash text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_turns_conversation_created_idx
  on public.whatsapp_turns (conversation_hash, created_at desc);

alter table public.whatsapp_turns enable row level security;
revoke all on table public.whatsapp_turns from public, anon, authenticated, agent_reader;

-- agent_reader holds SELECT-only grants by design, so the edge function cannot write to
-- this table directly. It calls these two SECURITY DEFINER functions instead, which is the
-- same pattern check_rate_limit already uses: a narrow, validated entry point rather than
-- a write grant.

create or replace function public.recent_whatsapp_turns(
  p_conversation_hash text,
  p_limit integer default 8,
  p_max_age interval default interval '2 hours'
) returns table (role text, content text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select t.role, t.content
  from (
    select w.role, w.content, w.created_at
    from public.whatsapp_turns w
    where w.conversation_hash = p_conversation_hash
      and w.created_at > clock_timestamp() - least(p_max_age, interval '24 hours')
    order by w.created_at desc
    limit least(greatest(p_limit, 0), 20)
  ) t
  order by t.created_at asc;
$$;

create or replace function public.record_whatsapp_turn(
  p_conversation_hash text,
  p_role text,
  p_content text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_conversation_hash is null or length(p_conversation_hash) <> 64 then
    raise exception 'conversation hash must be a sha-256 hex digest';
  end if;
  if p_role not in ('user', 'assistant') then
    raise exception 'invalid role';
  end if;

  insert into public.whatsapp_turns (conversation_hash, role, content)
  values (p_conversation_hash, p_role, left(coalesce(p_content, ''), 4000));

  -- Keep each conversation short at write time as well as read time, so a long-running
  -- sender cannot accumulate rows between cleanup runs.
  delete from public.whatsapp_turns
  where conversation_hash = p_conversation_hash
    and created_at < (
      select min(created_at) from (
        select created_at from public.whatsapp_turns
        where conversation_hash = p_conversation_hash
        order by created_at desc
        limit 20
      ) keep
    );
end;
$$;

create or replace function public.cleanup_whatsapp_turns() returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.whatsapp_turns where created_at < now() - interval '24 hours';
$$;

revoke all on function public.recent_whatsapp_turns(text, integer, interval)
  from public, anon, authenticated;
revoke all on function public.record_whatsapp_turn(text, text, text)
  from public, anon, authenticated;
revoke all on function public.cleanup_whatsapp_turns()
  from public, anon, authenticated, agent_reader;
grant execute on function public.recent_whatsapp_turns(text, integer, interval) to agent_reader;
grant execute on function public.record_whatsapp_turn(text, text, text) to agent_reader;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'cleanup-whatsapp-turns') then
      perform cron.schedule(
        'cleanup-whatsapp-turns',
        '23 3 * * *',
        'select public.cleanup_whatsapp_turns()'
      );
    end if;
  end if;
end;
$$;
