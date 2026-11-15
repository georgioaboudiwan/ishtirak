-- Ishtirak v1.7: official price, cut list and fees, costs, Whish/OMT payment claims, readings sent by subscribers.
-- Run after v1.6.sql.

create table public.official_prices (
  month date not null check (extract(day from month) = 1),
  band text not null check (band in ('low','high')),
  kwh_lbp numeric(14,2) not null check (kwh_lbp > 0),
  source text check (length(source) <= 500),
  primary key (month, band)
);
alter table public.official_prices enable row level security;
create policy official_read on public.official_prices for select to authenticated using (true);
revoke all on public.official_prices from anon, authenticated;
grant select on public.official_prices to authenticated;

alter table public.businesses add column band text not null default 'low' check (band in ('low','high'));
grant select (band), insert (band), update (band) on public.businesses to authenticated;
alter table public.tariffs add column official_kwh_lbp numeric(14,2) check (official_kwh_lbp is null or official_kwh_lbp > 0);
grant select (official_kwh_lbp), insert (official_kwh_lbp), update (official_kwh_lbp) on public.tariffs to authenticated;

alter table public.subscribers add column cut_at timestamptz;
grant select (cut_at), update (cut_at) on public.subscribers to authenticated;

create or replace function private.push_cut() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cut_at is not null and old.cut_at is null then
    insert into public.push_queue (audience, business_id, subscriber_id, payload) values ('subscriber', new.business_id, new.id, jsonb_build_object('t','cut'));
  elsif new.cut_at is null and old.cut_at is not null then
    insert into public.push_queue (audience, business_id, subscriber_id, payload) values ('subscriber', new.business_id, new.id, jsonb_build_object('t','back'));
  end if;
  return null;
end $$;
create trigger zz_push_cut after update of cut_at on public.subscribers for each row execute function private.push_cut();

alter table public.bills add column extra numeric(12,2) not null default 0 check (extra >= 0);
grant select (extra) on public.bills to authenticated;

create or replace function public.add_fee(p_bill uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bills%rowtype;
begin
  select * into b from public.bills where id = p_bill for update;
  if not found or not private.is_business_owner(b.business_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  update public.bills set extra = extra + round(p_amount, 2), amount = amount + round(p_amount, 2),
    status = case when paid_amount <= 0 then 'unpaid' when paid_amount >= amount + round(p_amount, 2) then 'paid' else 'partial' end
  where id = p_bill returning * into b;
  return to_jsonb(b);
end $$;

create or replace function public.warn_late(p_subs uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with owed as (
    select b.business_id, b.subscriber_id, sum(b.amount - b.paid_amount) as amount, count(*) as months
    from public.bills b
    where b.subscriber_id = any(p_subs) and private.is_business_owner(b.business_id) and b.amount > b.paid_amount
    group by b.business_id, b.subscriber_id
  ), q as (
    insert into public.push_queue (audience, business_id, subscriber_id, payload)
    select 'subscriber', business_id, subscriber_id, jsonb_build_object('t','late','amount',amount,'months',months) from owed
    returning 1
  )
  select count(*) into n from q;
  return n;
end $$;

create or replace function public.generate_bills(p_business uuid, p_month date)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  t public.tariffs%rowtype;
  s record;
  v_curr numeric(12,2);
  v_prev numeric(12,2);
  v_kwh numeric(12,2);
  v_amount numeric(12,2);
  v_existing public.bills%rowtype;
  created int := 0; updated int := 0; missing int := 0; locked int := 0; invalid int := 0;
begin
  if not private.is_business_owner(p_business) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  p_month := date_trunc('month', p_month)::date;
  select * into t from public.tariffs where business_id = p_business and month = p_month;
  if not found then
    raise exception 'tariff_missing' using errcode = 'P0001';
  end if;

  for s in select * from public.subscribers where business_id = p_business and active and status <> 'pending' loop
    v_curr := null; v_prev := null; v_kwh := null;
    if s.billing_type = 'metered' then
      select value into v_curr from public.readings where subscriber_id = s.id and month = p_month;
      if v_curr is null then missing := missing + 1; continue; end if;
      select value into v_prev from public.readings where subscriber_id = s.id and month < p_month order by month desc limit 1;
      v_prev := coalesce(v_prev, s.initial_reading);
      v_kwh := v_curr - v_prev;
      if v_kwh < 0 then invalid := invalid + 1; continue; end if;
      v_amount := round(v_kwh * t.kwh_price + s.amps * t.fixed_fee_per_amp, 2);
    else
      v_amount := round(s.amps * t.flat_amp_price, 2);
    end if;

    select * into v_existing from public.bills where subscriber_id = s.id and month = p_month;
    if found then
      if v_existing.paid_amount > 0 then locked := locked + 1; continue; end if;
      update public.bills set billing_type = s.billing_type, amps = s.amps, prev_reading = v_prev, curr_reading = v_curr,
        kwh = v_kwh, kwh_price = case when s.billing_type = 'metered' then t.kwh_price end,
        fixed_fee = case when s.billing_type = 'metered' then s.amps * t.fixed_fee_per_amp else t.flat_amp_price end,
        amount = v_amount + v_existing.extra
      where id = v_existing.id;
      updated := updated + 1;
    else
      insert into public.bills (business_id, subscriber_id, month, billing_type, amps, prev_reading, curr_reading, kwh, kwh_price, fixed_fee, amount)
      values (p_business, s.id, p_month, s.billing_type, s.amps, v_prev, v_curr, v_kwh,
        case when s.billing_type = 'metered' then t.kwh_price end,
        case when s.billing_type = 'metered' then s.amps * t.fixed_fee_per_amp else t.flat_amp_price end,
        v_amount);
      created := created + 1;
    end if;
  end loop;

  return jsonb_build_object('created', created, 'updated', updated, 'missing_reading', missing, 'locked', locked, 'invalid_reading', invalid);
end $function$;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null default current_date,
  kind text not null check (kind in ('diesel','oil','repair','salary','other')),
  amount numeric(12,2) not null check (amount > 0 and amount < 1000000),
  liters numeric(10,2) check (liters is null or (liters > 0 and liters < 1000000)),
  note text check (length(note) <= 600),
  created_at timestamptz not null default now()
);
create index on public.expenses (business_id, day);
alter table public.expenses enable row level security;
create policy expenses_owner_all on public.expenses for all to authenticated
  using (private.is_business_owner(business_id)) with check (private.is_business_owner(business_id));
revoke all on public.expenses from anon, authenticated;
grant select, delete on public.expenses to authenticated;
grant insert (business_id, day, kind, amount, liters, note), update (day, kind, amount, liters, note) on public.expenses to authenticated;

create table public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  method text not null check (method in ('whish','omt','other')),
  amount numeric(12,2) not null check (amount > 0),
  ref text check (length(ref) <= 600),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.payment_claims (business_id, status);
alter table public.payment_claims enable row level security;
create policy claims_owner_read on public.payment_claims for select to authenticated using (private.is_business_owner(business_id));
create policy claims_owner_decide on public.payment_claims for update to authenticated
  using (private.is_business_owner(business_id)) with check (private.is_business_owner(business_id));
create policy claims_self_read on public.payment_claims for select to authenticated using (private.is_my_subscription(subscriber_id));
revoke all on public.payment_claims from anon, authenticated;
grant select on public.payment_claims to authenticated;
grant update (status, decided_at) on public.payment_claims to authenticated;

create or replace function public.claim_payment(p_bill uuid, p_method text, p_amount numeric, p_ref text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.bills%rowtype; v_id uuid;
begin
  select * into b from public.bills where id = p_bill;
  if not found or not private.is_my_subscription(b.subscriber_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_method not in ('whish','omt','other') then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > b.amount - b.paid_amount then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_ref is not null and not private.valid_enc(p_ref, 600) then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if (select count(*) from public.payment_claims where bill_id = p_bill and status = 'pending') >= 3 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  insert into public.payment_claims (business_id, subscriber_id, bill_id, method, amount, ref)
    values (b.business_id, b.subscriber_id, p_bill, p_method, round(p_amount, 2), p_ref) returning id into v_id;
  insert into public.push_queue (audience, business_id, payload) values ('owner', b.business_id, jsonb_build_object('t','claim','amount',round(p_amount, 2),'method',p_method));
  return v_id;
end $$;

create table public.reading_claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  value numeric(12,2) not null check (value >= 0 and value < 100000000),
  photo boolean not null default false,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (subscriber_id, month)
);
create index on public.reading_claims (business_id, status);
alter table public.reading_claims enable row level security;
create policy rclaims_owner_read on public.reading_claims for select to authenticated using (private.is_business_owner(business_id));
create policy rclaims_owner_decide on public.reading_claims for update to authenticated
  using (private.is_business_owner(business_id)) with check (private.is_business_owner(business_id));
create policy rclaims_self_read on public.reading_claims for select to authenticated using (private.is_my_subscription(subscriber_id));
revoke all on public.reading_claims from anon, authenticated;
grant select on public.reading_claims to authenticated;
grant update (status, decided_at) on public.reading_claims to authenticated;

create or replace function public.submit_reading(p_sub uuid, p_month date, p_value numeric, p_photo boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.subscribers%rowtype; v_id uuid; v_now date := date_trunc('month', (now() at time zone 'Asia/Beirut'))::date;
begin
  select * into s from public.subscribers where id = p_sub;
  if not found or not private.is_my_subscription(p_sub) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.billing_type <> 'metered' then raise exception 'not_metered' using errcode = 'P0001'; end if;
  p_month := date_trunc('month', p_month)::date;
  if p_month not in (v_now, (v_now - interval '1 month')::date) then raise exception 'invalid_month' using errcode = 'P0001'; end if;
  if p_value is null or p_value < 0 or p_value >= 100000000 then raise exception 'invalid_data' using errcode = 'P0001'; end if;
  if exists (select 1 from public.readings where subscriber_id = p_sub and month = p_month)
     or exists (select 1 from public.reading_claims where subscriber_id = p_sub and month = p_month and status = 'accepted') then
    raise exception 'already_read' using errcode = 'P0001';
  end if;
  insert into public.reading_claims (business_id, subscriber_id, month, value, photo)
    values (s.business_id, p_sub, p_month, round(p_value, 2), coalesce(p_photo, false))
  on conflict (subscriber_id, month) do update set value = excluded.value, photo = excluded.photo, status = 'pending', created_at = now(), decided_at = null
  returning id into v_id;
  insert into public.push_queue (audience, business_id, payload) values ('owner', s.business_id, jsonb_build_object('t','reading','month',p_month));
  return v_id;
end $$;

create policy meters_self_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meters' and private.my_meter_path(name) and name ~ '/\d{4}-\d{2}-sub\.bin$');
create policy meters_self_update on storage.objects for update to authenticated
  using (bucket_id = 'meters' and private.my_meter_path(name) and name ~ '/\d{4}-\d{2}-sub\.bin$')
  with check (bucket_id = 'meters' and private.my_meter_path(name) and name ~ '/\d{4}-\d{2}-sub\.bin$');

revoke all on function public.add_fee(uuid, numeric), public.warn_late(uuid[]), public.claim_payment(uuid, text, numeric, text), public.submit_reading(uuid, date, numeric, boolean) from public, anon;
grant execute on function public.add_fee(uuid, numeric), public.warn_late(uuid[]), public.claim_payment(uuid, text, numeric, text), public.submit_reading(uuid, date, numeric, boolean) to authenticated;
revoke all on function private.push_cut() from public, anon, authenticated;

create or replace function public.my_subscriptions()
 returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'business_id', s.business_id, 'status', s.status, 'enc', s.enc, 'amps', s.amps,
    'billing_type', s.billing_type, 'active', s.active, 'cut_at', s.cut_at,
    'business', jsonb_build_object('name', b.name, 'phone', b.phone, 'area', b.area, 'lbp_rate', b.lbp_rate)
  ) order by s.created_at), '[]'::jsonb)
  from public.subscriber_access a
  join public.subscribers s on s.id = a.subscriber_id
  join public.businesses b on b.id = s.business_id
  where a.user_id = (select auth.uid());
$function$;
