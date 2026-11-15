-- Ishtirak v1.7: app logs, problem reports, admin emails.
-- After running: insert into public.app_admins (user_id) select id from auth.users where email = '<admin email>';

create table public.app_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
grant execute on function private.is_admin() to authenticated;

create or replace function public.am_i_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin();
$$;

create table public.app_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null check (level in ('error','report')),
  user_id uuid,
  anon boolean not null default true,
  mode text check (length(mode) <= 20),
  business_id uuid,
  message text not null check (length(message) between 1 and 2000),
  context jsonb check (pg_column_size(context) < 6000),
  version text check (length(version) <= 20),
  notified boolean not null default false
);
create index on public.app_logs (created_at desc);
create index on public.app_logs (notified) where not notified;
alter table public.app_logs enable row level security;
create policy logs_admin_read on public.app_logs for select to authenticated using (private.is_admin());
create policy logs_admin_delete on public.app_logs for delete to authenticated using (private.is_admin());
revoke all on public.app_logs from anon, authenticated;
grant select, delete on public.app_logs to authenticated;

create or replace function public.log_event(p_level text, p_message text, p_context jsonb, p_mode text, p_version text, p_business uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_recent int;
begin
  if p_level not in ('error','report') or p_message is null or length(trim(p_message)) = 0 then return; end if;
  select count(*) into v_recent from public.app_logs
    where created_at > now() - interval '1 hour' and level = p_level
      and (user_id = v_uid or (v_uid is null and user_id is null));
  if (p_level = 'error' and v_recent >= case when v_uid is null then 200 else 40 end)
     or (p_level = 'report' and v_recent >= case when v_uid is null then 20 else 6 end) then
    return;
  end if;
  insert into public.app_logs (level, user_id, anon, mode, business_id, message, context, version)
  values (p_level, v_uid, coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, v_uid is null), left(p_mode, 20), p_business,
    left(p_message, 2000), case when pg_column_size(p_context) < 6000 then p_context end, left(p_version, 20));
end $$;
revoke all on function public.log_event(text, text, jsonb, text, text, uuid) from public;
grant execute on function public.log_event(text, text, jsonb, text, text, uuid) to anon, authenticated;

create or replace function private.esc(p text) returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

create or replace function private.mail_admin(p_subject text, p_html text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cpqtthvtljbhawhjllbz.supabase.co/functions/v1/release-mail',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-drain', (select decrypted_secret from vault.decrypted_secrets where name = 'push_drain')),
    body := jsonb_build_object('subject', left(p_subject, 200), 'html', p_html),
    timeout_milliseconds := 30000);
end $$;

create or replace function private.mail_shell(p_title text, p_body text) returns text language sql immutable set search_path = '' as $$
  select '<!doctype html><html><body style="margin:0;background:#eef1f5;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#0f1620;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;">'
    || '<tr><td style="background:#121a24;padding:22px 26px;"><div style="font-size:13px;color:#93a1b2;">&#9889; Ishtirak admin</div>'
    || '<div style="font-size:22px;font-weight:700;color:#f2f5f8;margin-top:4px;">' || p_title || '</div></td></tr>'
    || '<tr><td style="padding:20px 26px 26px;font-size:14px;line-height:1.6;">' || p_body || '</td></tr></table></td></tr></table></body></html>';
$$;

create or replace function private.notify_report() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_biz text;
begin
  if new.level <> 'report' then return null; end if;
  select name into v_biz from public.businesses where id = new.business_id;
  perform private.mail_admin('Ishtirak: problem reported' || coalesce(' (' || v_biz || ')', ''),
    private.mail_shell('New problem report',
      '<p style="white-space:pre-wrap;font-size:15px;margin:0 0 16px;">' || private.esc(new.message) || '</p>'
      || '<table style="font-size:13px;color:#5d6877;border-collapse:collapse;">'
      || '<tr><td style="padding:2px 12px 2px 0;">When</td><td>' || to_char(new.created_at at time zone 'Asia/Beirut', 'YYYY-MM-DD HH24:MI') || ' (Beirut)</td></tr>'
      || '<tr><td style="padding:2px 12px 2px 0;">Who</td><td>' || private.esc(coalesce(new.mode, '?')) || case when new.anon then ' (link user)' else '' end || '</td></tr>'
      || '<tr><td style="padding:2px 12px 2px 0;">Generator</td><td>' || private.esc(coalesce(v_biz, '-')) || '</td></tr>'
      || '<tr><td style="padding:2px 12px 2px 0;">Version</td><td>' || private.esc(coalesce(new.version, '-')) || '</td></tr>'
      || '<tr><td style="padding:2px 12px 2px 0;vertical-align:top;">Details</td><td style="font-family:monospace;font-size:12px;white-space:pre-wrap;">' || private.esc(coalesce(jsonb_pretty(new.context), '-')) || '</td></tr>'
      || '</table><p style="margin:18px 0 0;"><a href="https://georgioaboudiwan.github.io/ishtirak/" style="color:#b87800;font-weight:700;">Open the app logs</a></p>'));
  update public.app_logs set notified = true where id = new.id;
  return null;
end $$;
create trigger zz_notify_report after insert on public.app_logs for each row execute function private.notify_report();

create or replace function private.mail_error_digest() returns int language plpgsql security definer set search_path = '' as $$
declare v_n int; v_rows text;
begin
  delete from public.app_logs where created_at < now() - interval '90 days';
  select count(*) into v_n from public.app_logs where level = 'error' and not notified;
  if v_n = 0 then return 0; end if;
  select string_agg('<tr><td style="padding:6px 10px 6px 0;font-weight:700;vertical-align:top;">' || cnt || '×</td><td style="padding:6px 0;"><div style="font-family:monospace;font-size:12px;white-space:pre-wrap;">' || private.esc(left(message, 300)) || '</div><div style="color:#8a95a3;font-size:12px;">' || private.esc(coalesce(modes, '')) || ' · v' || private.esc(coalesce(ver, '?')) || ' · last ' || to_char(last_at at time zone 'Asia/Beirut', 'MM-DD HH24:MI') || '</div></td></tr>', '' order by cnt desc)
    into v_rows
  from (select message, count(*) cnt, string_agg(distinct mode, ', ') modes, max(version) ver, max(created_at) last_at
        from public.app_logs where level = 'error' and not notified group by message order by count(*) desc limit 25) g;
  perform private.mail_admin('Ishtirak: ' || v_n || ' app error' || case when v_n > 1 then 's' else '' end,
    private.mail_shell(v_n || ' new error' || case when v_n > 1 then 's' else '' end,
      '<table style="border-collapse:collapse;width:100%;">' || v_rows || '</table>'));
  update public.app_logs set notified = true where level = 'error' and not notified;
  return v_n;
end $$;

revoke all on function private.mail_admin(text, text), private.notify_report(), private.mail_error_digest() from public, anon, authenticated;
select cron.schedule('error-digest', '0 * * * *', 'select private.mail_error_digest()');
