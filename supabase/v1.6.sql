-- Ishtirak v1.6: notifications, payment reminders, meter photos.
-- Run after schema.sql. Then store these secrets in the Vault (Dashboard > Project Settings > Vault, or SQL):
--   select vault.create_secret('<random 32+ chars>', 'push_drain');
--   select vault.create_secret('<VAPID public key>', 'vapid_public');
--   select vault.create_secret('<VAPID private key>', 'vapid_private');
--   select vault.create_secret('https://<user>.github.io/ishtirak/', 'vapid_subject');
--   optional, for the Android/iPhone apps: select vault.create_secret('<Firebase service account JSON>', 'fcm_service_account');
-- and deploy supabase/functions/notify with "Verify JWT" off (it checks the push_drain secret itself).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ===== Push subscriptions =====
create table public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'web' check (kind in ('web','fcm')),
  endpoint text not null unique check (length(endpoint) between 10 and 1000),
  p256dh text check (p256dh is null or length(p256dh) < 200),
  auth text check (auth is null or length(auth) < 100),
  lang text not null default 'ar' check (lang in ('ar','en')),
  created_at timestamptz not null default now()
);
create index on public.push_subs(user_id);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;

create or replace function public.save_push(p_kind text, p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind not in ('web','fcm') or p_endpoint is null or length(p_endpoint) not between 10 and 1000 then
    raise exception 'invalid_data' using errcode = 'P0001';
  end if;
  if p_kind = 'web' and p_endpoint !~ '^https://' then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if (select count(*) from public.push_subs where user_id = v_uid) >= 10 then
    delete from public.push_subs where id in (select id from public.push_subs where user_id = v_uid order by created_at limit 1);
  end if;
  delete from public.push_subs where endpoint = p_endpoint;
  insert into public.push_subs (user_id, kind, endpoint, p256dh, auth, lang)
    values (v_uid, p_kind, p_endpoint, left(p_p256dh, 199), left(p_auth, 99), case when p_lang = 'en' then 'en' else 'ar' end);
end $$;

create or replace function public.drop_push(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subs where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

-- ===== Outbox (filled by triggers, emptied by the notify function) =====
create table public.push_queue (
  id bigint generated always as identity primary key,
  audience text not null check (audience in ('owner','subscriber','all_subs')),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

create or replace function private.push_bill() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_queue (audience, business_id, subscriber_id, payload)
  values ('subscriber', new.business_id, new.subscriber_id,
    jsonb_build_object('t','bill','amount',new.amount,'month',new.month));
  return null;
end $$;
create trigger zz_push_bill after insert on public.bills for each row execute function private.push_bill();

create or replace function private.push_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare b public.bills%rowtype;
begin
  select * into b from public.bills where id = new.bill_id;
  if found then
    insert into public.push_queue (audience, business_id, subscriber_id, payload)
    values ('subscriber', b.business_id, b.subscriber_id,
      jsonb_build_object('t','paid','amount',new.amount,'month',b.month,'left',greatest(b.amount - b.paid_amount, 0)));
  end if;
  return null;
end $$;
create trigger zz_push_payment after insert on public.payments for each row execute function private.push_payment();

create or replace function private.push_notice() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_queue (audience, business_id, payload)
  values ('all_subs', new.business_id, jsonb_build_object('t','notice','title',left(new.title,120),'body',left(coalesce(new.body,''),200)));
  return null;
end $$;
create trigger zz_push_notice after insert on public.notices for each row execute function private.push_notice();

create or replace function private.push_join() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    insert into public.push_queue (audience, business_id, payload) values ('owner', new.business_id, jsonb_build_object('t','join'));
  end if;
  return null;
end $$;
create trigger zz_push_join after insert on public.subscribers for each row execute function private.push_join();

-- ===== Payment reminders =====
alter table public.businesses add column reminder_days int not null default 7 check (reminder_days between 0 and 60);
grant select (reminder_days), update (reminder_days), insert (reminder_days) on public.businesses to authenticated;
alter table public.bills add column last_reminded_at timestamptz;
grant select (last_reminded_at) on public.bills to authenticated;

create or replace function private.queue_reminders() returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    select b.business_id, b.subscriber_id, sum(b.amount - b.paid_amount) as owed, count(*) as bills, array_agg(b.id) as ids
    from public.bills b
    join public.businesses z on z.id = b.business_id
    join public.subscribers s on s.id = b.subscriber_id
    where z.reminder_days > 0 and s.status = 'active' and s.active
      and b.amount - b.paid_amount > 0
      and b.created_at < now() - make_interval(days => z.reminder_days)
    group by b.business_id, b.subscriber_id, z.reminder_days
    having max(coalesce(b.last_reminded_at, '-infinity')) < now() - make_interval(days => z.reminder_days) - interval '2 hours'
  ), q as (
    insert into public.push_queue (audience, business_id, subscriber_id, payload)
    select 'subscriber', business_id, subscriber_id, jsonb_build_object('t','remind','amount',owed,'bills',bills) from due
    returning 1
  ), u as (
    update public.bills set last_reminded_at = now() where id in (select unnest(ids) from due) returning 1
  )
  select count(*) into n from q;
  return n;
end $$;

-- ===== Sender access (service role only) =====
create or replace function public.push_take(p_limit int default 300)
returns table (endpoint text, kind text, p256dh text, auth text, lang text, biz text, payload jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_queue where created_at < now() - interval '1 day';
  return query
  with taken as (
    delete from public.push_queue where id in (select id from public.push_queue order by id limit p_limit)
    returning *
  ), users as (
    select t.id, z.owner_id as user_id, t.payload, z.name from taken t join public.businesses z on z.id = t.business_id where t.audience = 'owner'
    union all
    select t.id, a.user_id, t.payload, z.name from taken t join public.businesses z on z.id = t.business_id
      join public.subscribers s on s.id = t.subscriber_id and s.status = 'active'
      join public.subscriber_access a on a.subscriber_id = s.id where t.audience = 'subscriber'
    union all
    select t.id, a.user_id, t.payload, z.name from taken t join public.businesses z on z.id = t.business_id
      join public.subscribers s on s.business_id = t.business_id and s.status = 'active' and s.active
      join public.subscriber_access a on a.subscriber_id = s.id where t.audience = 'all_subs'
  )
  select p.endpoint, p.kind, p.p256dh, p.auth, p.lang, u.name, u.payload
  from users u join public.push_subs p on p.user_id = u.user_id;
end $$;

create or replace function public.push_forget(p_endpoints text[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subs where endpoint = any(p_endpoints);
$$;

create or replace function public.push_config() returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets where name in ('push_drain','vapid_public','vapid_private','vapid_subject','fcm_service_account');
$$;

revoke all on function public.push_take(int), public.push_forget(text[]), public.push_config() from public, anon, authenticated;
grant execute on function public.push_take(int), public.push_forget(text[]), public.push_config() to service_role;
revoke all on function public.save_push(text,text,text,text,text), public.drop_push(text) from public, anon;
grant execute on function public.save_push(text,text,text,text,text), public.drop_push(text) to authenticated;
revoke all on function private.queue_reminders(), private.push_bill(), private.push_payment(), private.push_notice(), private.push_join() from public, anon, authenticated;

-- Change the project ref in the URL when rebuilding on another project.
create or replace function private.kick_push() returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_queue) then
    perform net.http_post(
      url := 'https://cpqtthvtljbhawhjllbz.supabase.co/functions/v1/notify',
      headers := jsonb_build_object('Content-Type','application/json',
        'x-drain', (select decrypted_secret from vault.decrypted_secrets where name = 'push_drain')),
      body := '{}'::jsonb, timeout_milliseconds := 20000);
  end if;
end $$;
revoke all on function private.kick_push() from public, anon, authenticated;

select cron.schedule('push-drain', '* * * * *', 'select private.kick_push()');
select cron.schedule('payment-reminders', '0 7 * * *', 'select private.queue_reminders()'); -- 9:00 Beirut (winter)

-- ===== Meter photos (encrypted in the browser with the subscriber's key) =====
alter table public.readings add column photo boolean not null default false;
grant select (photo), insert (photo), update (photo) on public.readings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meters', 'meters', false, 3145728, array['application/octet-stream'])
on conflict (id) do nothing;

create or replace function private.owns_meter_path(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscribers s join public.businesses b on b.id = s.business_id
    where b.owner_id = (select auth.uid())
      and b.id::text = split_part(p_name, '/', 1) and s.id::text = split_part(p_name, '/', 2));
$$;
create or replace function private.my_meter_path(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriber_access a join public.subscribers s on s.id = a.subscriber_id
    where a.user_id = (select auth.uid()) and s.status = 'active'
      and s.business_id::text = split_part(p_name, '/', 1) and s.id::text = split_part(p_name, '/', 2));
$$;
grant execute on function private.owns_meter_path(text), private.my_meter_path(text) to authenticated;

create policy meters_owner_read on storage.objects for select to authenticated using (bucket_id = 'meters' and private.owns_meter_path(name));
create policy meters_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'meters' and private.owns_meter_path(name));
create policy meters_owner_update on storage.objects for update to authenticated using (bucket_id = 'meters' and private.owns_meter_path(name)) with check (bucket_id = 'meters' and private.owns_meter_path(name));
create policy meters_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'meters' and private.owns_meter_path(name));
create policy meters_self_read on storage.objects for select to authenticated using (bucket_id = 'meters' and private.my_meter_path(name));
