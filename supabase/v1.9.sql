alter table public.notices add column if not exists kind text check (kind in ('off','on','maint'));
alter table public.notices add column if not exists meta jsonb check (meta is null or (jsonb_typeof(meta) = 'object' and length(meta::text) < 200));
grant insert (kind, meta) on public.notices to authenticated;

alter table public.businesses add column if not exists capacity_amps integer check (capacity_amps between 1 and 100000);
alter table public.businesses add column if not exists oil_days integer not null default 15 check (oil_days between 1 and 365);
grant insert (capacity_amps, oil_days), update (capacity_amps, oil_days) on public.businesses to authenticated;

create table if not exists public.handovers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  collector_id uuid not null references public.collectors(id) on delete cascade,
  usd numeric(12,2) not null default 0 check (usd >= 0 and usd < 10000000),
  lbp numeric(18,0) not null default 0 check (lbp >= 0 and lbp < 1000000000000),
  until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists handovers_collector on public.handovers (collector_id, until desc);
create index if not exists handovers_business on public.handovers (business_id);
alter table public.handovers enable row level security;
revoke all on public.handovers from anon, authenticated;
grant select, delete on public.handovers to authenticated;
grant insert (business_id, collector_id, usd, lbp, until) on public.handovers to authenticated;
create policy handovers_owner_read on public.handovers for select to authenticated using (private.is_business_owner(business_id));
create policy handovers_owner_insert on public.handovers for insert to authenticated with check (
  private.is_business_owner(business_id)
  and exists (select 1 from public.collectors c where c.id = collector_id and c.business_id = handovers.business_id)
  and until <= now() + interval '1 minute');
create policy handovers_owner_delete on public.handovers for delete to authenticated using (private.is_business_owner(business_id));
create policy handovers_collector_read on public.handovers for select to authenticated using (collector_id = private.my_collector_id(business_id));

create table if not exists public.sub_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  kind text not null check (kind in ('no_power','amps','other')),
  amps integer check (amps between 1 and 1000),
  note text,
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists sub_requests_business on public.sub_requests (business_id, status);
create index if not exists sub_requests_subscriber on public.sub_requests (subscriber_id);
alter table public.sub_requests enable row level security;
revoke all on public.sub_requests from anon, authenticated;
grant select, delete on public.sub_requests to authenticated;
grant update (status, decided_at) on public.sub_requests to authenticated;
create policy subreq_owner_read on public.sub_requests for select to authenticated using (private.is_business_owner(business_id));
create policy subreq_owner_update on public.sub_requests for update to authenticated using (private.is_business_owner(business_id)) with check (private.is_business_owner(business_id));
create policy subreq_owner_delete on public.sub_requests for delete to authenticated using (private.is_business_owner(business_id));
create policy subreq_self_read on public.sub_requests for select to authenticated using (private.is_my_subscription(subscriber_id));

create or replace function public.send_request(p_sub uuid, p_kind text, p_amps integer, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.subscribers%rowtype; v_id uuid;
begin
  select * into s from public.subscribers where id = p_sub;
  if not found or s.status <> 'active' or not private.is_my_subscription(p_sub) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind not in ('no_power','amps','other') then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if p_kind = 'amps' and (p_amps is null or p_amps not between 1 and 1000) then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if p_note is not null and not private.valid_enc(p_note, 1200) then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if (select count(*) from public.sub_requests where subscriber_id = p_sub and status = 'pending') >= 3
     or (select count(*) from public.sub_requests where subscriber_id = p_sub and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  insert into public.sub_requests (business_id, subscriber_id, kind, amps, note)
    values (s.business_id, p_sub, p_kind, case when p_kind = 'amps' then p_amps end, p_note) returning id into v_id;
  insert into public.push_queue (audience, business_id, payload) values ('owner', s.business_id, jsonb_build_object('t','request','kind',p_kind,'amps',p_amps));
  return v_id;
end $$;
revoke all on function public.send_request(uuid, text, integer, text) from public, anon;
grant execute on function public.send_request(uuid, text, integer, text) to authenticated;

create or replace function public.collector_cash(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.my_collector_id(p_business); own boolean := private.is_business_owner(p_business);
begin
  if not own and me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object('at', now(), 'list', coalesce((select jsonb_agg(x) from (
    select c.id as collector_id,
      coalesce(sum(p.amount) filter (where p.lbp_amount is null), 0) as usd,
      coalesce(sum(p.lbp_amount), 0) as lbp,
      coalesce(sum(p.amount), 0) as total,
      count(p.id) as n,
      h.until as since
    from public.collectors c
    left join lateral (select max(x.until) as until from public.handovers x where x.collector_id = c.id) h on true
    left join public.payments p on p.collector_id = c.id and p.method = 'cash' and p.paid_at > coalesce(h.until, '-infinity'::timestamptz) and p.paid_at <= now()
    where c.business_id = p_business and (own or c.id = me)
    group by c.id, h.until) x), '[]'::jsonb));
end $$;
revoke all on function public.collector_cash(uuid) from public, anon;
grant execute on function public.collector_cash(uuid) to authenticated;

create or replace function private.push_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_queue (audience, business_id, payload)
  values ('all_subs', new.business_id, jsonb_build_object('t','notice','title',left(new.title,120),'body',left(coalesce(new.body,''),200),'kind',new.kind,'meta',new.meta));
  return null;
end $$;

create or replace function public.owner_home(p_business uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_business_owner(p_business) then raise exception 'not_allowed' using errcode = '42501'; end if;
  p_month := date_trunc('month', p_month)::date;
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.subscribers s where s.business_id = p_business), '[]'::jsonb),
    'tariff', (select to_jsonb(t) from public.tariffs t where t.business_id = p_business and t.month = p_month),
    'readings', coalesce((select jsonb_agg(jsonb_build_object('subscriber_id', r.subscriber_id)) from public.readings r
      join public.subscribers s on s.id = r.subscriber_id where s.business_id = p_business and r.month = p_month), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(private.bill_json(b)) from public.bills b where b.business_id = p_business and b.month = p_month), '[]'::jsonb),
    'open', coalesce((select jsonb_agg(private.bill_json(b)) from public.bills b where b.business_id = p_business and b.status <> 'paid'), '[]'::jsonb),
    'collectors', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.collectors c where c.business_id = p_business), '[]'::jsonb),
    'pay_claims', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('bills', (select private.bill_json(b) from public.bills b where b.id = c.bill_id)) order by c.created_at)
      from public.payment_claims c where c.business_id = p_business and c.status = 'pending'), '[]'::jsonb),
    'read_claims', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.reading_claims c where c.business_id = p_business and c.status = 'pending'), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.sub_requests r where r.business_id = p_business and r.status = 'pending'), '[]'::jsonb),
    'upkeep', jsonb_build_object(
      'last_oil', (select max(e.day) from public.expenses e where e.business_id = p_business and e.kind = 'oil'),
      'diesel', coalesce((select jsonb_agg(jsonb_build_object('day', e.day, 'liters', e.liters) order by e.day, e.created_at)
        from public.expenses e where e.business_id = p_business and e.kind = 'diesel' and e.liters > 0 and e.day > current_date - 120), '[]'::jsonb)),
    'notice', (select jsonb_build_object('kind', n.kind, 'meta', n.meta, 'title', n.title, 'created_at', n.created_at) from public.notices n
      where n.business_id = p_business and n.created_at > now() - interval '2 days' order by n.created_at desc limit 1)
  );
end $$;

alter table public.sub_requests add column if not exists reply text check (reply in ('onit','fixed','done','no'));

create or replace function public.reply_requests(p_ids uuid[], p_reply text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_reply not in ('onit','fixed','done','no') or coalesce(array_length(p_ids, 1), 0) not between 1 and 500 then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  with up as (
    update public.sub_requests r set reply = p_reply,
      status = case when p_reply = 'onit' then 'pending' else 'done' end,
      decided_at = case when p_reply = 'onit' then r.decided_at else now() end
    where r.id = any(p_ids) and private.is_business_owner(r.business_id)
    returning r.business_id, r.subscriber_id, r.kind, r.amps
  ), q as (
    insert into public.push_queue (audience, business_id, subscriber_id, payload)
    select 'subscriber', business_id, subscriber_id, jsonb_build_object('t','reply','reply',p_reply,'kind',kind,'amps',amps) from up
    returning 1
  )
  select count(*) into n from q;
  return n;
end $$;
revoke all on function public.reply_requests(uuid[], text) from public, anon;
grant execute on function public.reply_requests(uuid[], text) to authenticated;

create or replace function public.my_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  with subs as (
    select s.id, s.business_id from public.subscriber_access a join public.subscribers s on s.id = a.subscriber_id
    where a.user_id = (select auth.uid()) and s.status = 'active'
  ), b as (
    select * from public.bills where subscriber_id in (select id from subs) order by month desc limit 60
  )
  select jsonb_build_object(
    'bills', coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('payments', coalesce((
        select jsonb_agg(jsonb_build_object('amount', p.amount, 'method', p.method, 'paid_at', p.paid_at, 'lbp_amount', p.lbp_amount) order by p.paid_at)
        from public.payments p where p.bill_id = b.id), '[]'::jsonb)) order by b.month desc) from b), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('subscriber_id', r.subscriber_id, 'month', r.month))
      from public.readings r where r.subscriber_id in (select id from subs) and r.photo), '[]'::jsonb),
    'pay_claims', coalesce((select jsonb_agg(jsonb_build_object('bill_id', c.bill_id, 'amount', c.amount, 'method', c.method, 'status', c.status))
      from public.payment_claims c where c.subscriber_id in (select id from subs) and c.status = 'pending'), '[]'::jsonb),
    'read_claims', coalesce((select jsonb_agg(jsonb_build_object('subscriber_id', c.subscriber_id, 'month', c.month, 'value', c.value, 'status', c.status))
      from public.reading_claims c where c.subscriber_id in (select id from subs)
        and c.month = date_trunc('month', (now() at time zone 'Asia/Beirut'))::date), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'subscriber_id', r.subscriber_id, 'kind', r.kind, 'amps', r.amps, 'status', r.status, 'reply', r.reply, 'created_at', r.created_at) order by r.created_at desc)
      from public.sub_requests r where r.subscriber_id in (select id from subs) and (r.status = 'pending' or r.decided_at > now() - interval '3 days')), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('business_id', n.business_id, 'kind', n.kind, 'meta', n.meta, 'title', n.title, 'body', n.body, 'created_at', n.created_at) order by n.created_at desc)
      from (select distinct on (n.business_id) n.* from public.notices n where n.business_id in (select business_id from subs) and n.created_at > now() - interval '2 days'
        order by n.business_id, n.created_at desc) n), '[]'::jsonb)
  );
$$;
