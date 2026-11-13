-- Ishtirak database setup: tables, functions, triggers, security rules and grants.
-- Generated from the live Supabase project on 2026-11-13. Apply to an empty Supabase project to rebuild it.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

CREATE OR REPLACE FUNCTION private.gen_code(n integer)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(n);
  code text := '';
  i int;
begin
  for i in 0..n-1 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return code;
end $function$
;

create table public.bills (
  id uuid not null default gen_random_uuid(),
  business_id uuid not null,
  subscriber_id uuid not null,
  month date not null,
  billing_type text not null,
  amps integer not null,
  prev_reading numeric(12,2),
  curr_reading numeric(12,2),
  kwh numeric(12,2),
  kwh_price numeric(12,4),
  fixed_fee numeric(12,2),
  amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  status text not null default 'unpaid'::text,
  created_at timestamp with time zone not null default now()
);

create table public.business_keys (
  business_id uuid not null,
  salt text not null,
  wrapped_pw text not null,
  wrapped_rc text not null,
  wpriv text not null,
  updated_at timestamp with time zone not null default now()
);

create table public.businesses (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  phone text,
  area text,
  lbp_rate numeric(12,2) not null default 89500,
  created_at timestamp with time zone not null default now(),
  join_code text not null default private.gen_code(8),
  pub text
);

create table public.collector_access (
  collector_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.collectors (
  id uuid not null default gen_random_uuid(),
  business_id uuid not null,
  name_enc text not null,
  wbk text not null,
  wck text not null,
  invite_code text not null default private.gen_code(24),
  active boolean not null default true,
  devices integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table public.notices (
  id uuid not null default gen_random_uuid(),
  business_id uuid not null,
  title text not null,
  body text,
  created_at timestamp with time zone not null default now()
);

create table public.payments (
  id uuid not null default gen_random_uuid(),
  bill_id uuid not null,
  amount numeric(12,2) not null,
  method text not null,
  note text,
  paid_at timestamp with time zone not null default now(),
  collector_id uuid,
  lbp_amount numeric(15,0),
  lbp_rate numeric(12,2)
);

create table public.readings (
  id uuid not null default gen_random_uuid(),
  subscriber_id uuid not null,
  month date not null,
  value numeric(12,2) not null,
  created_at timestamp with time zone not null default now()
);

create table public.subscriber_access (
  subscriber_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.subscribers (
  id uuid not null default gen_random_uuid(),
  business_id uuid not null,
  amps integer not null,
  billing_type text not null,
  initial_reading numeric(12,2) not null default 0,
  active boolean not null default true,
  invite_code text not null default private.gen_code(24),
  created_at timestamp with time zone not null default now(),
  enc text not null,
  wk text,
  jk text,
  oenc text,
  status text not null default 'invited'::text,
  accepted_at timestamp with time zone,
  devices integer not null default 0
);

create table public.tariffs (
  id uuid not null default gen_random_uuid(),
  business_id uuid not null,
  month date not null,
  kwh_price numeric(12,4) not null default 0,
  fixed_fee_per_amp numeric(12,2) not null default 0,
  flat_amp_price numeric(12,2) not null default 0,
  created_at timestamp with time zone not null default now()
);

alter table public.bills add constraint bills_pkey PRIMARY KEY (id);

alter table public.business_keys add constraint business_keys_pkey PRIMARY KEY (business_id);

alter table public.businesses add constraint businesses_pkey PRIMARY KEY (id);

alter table public.collector_access add constraint collector_access_pkey PRIMARY KEY (collector_id, user_id);

alter table public.collectors add constraint collectors_pkey PRIMARY KEY (id);

alter table public.notices add constraint notices_pkey PRIMARY KEY (id);

alter table public.payments add constraint payments_pkey PRIMARY KEY (id);

alter table public.readings add constraint readings_pkey PRIMARY KEY (id);

alter table public.subscriber_access add constraint subscriber_access_pkey PRIMARY KEY (subscriber_id, user_id);

alter table public.subscribers add constraint subscribers_pkey PRIMARY KEY (id);

alter table public.tariffs add constraint tariffs_pkey PRIMARY KEY (id);

alter table public.bills add constraint bills_subscriber_id_month_key UNIQUE (subscriber_id, month);

alter table public.businesses add constraint businesses_join_code_key UNIQUE (join_code);

alter table public.businesses add constraint businesses_owner_id_key UNIQUE (owner_id);

alter table public.collectors add constraint collectors_invite_code_key UNIQUE (invite_code);

alter table public.readings add constraint readings_subscriber_id_month_key UNIQUE (subscriber_id, month);

alter table public.subscribers add constraint subscribers_invite_code_key UNIQUE (invite_code);

alter table public.tariffs add constraint tariffs_business_id_month_key UNIQUE (business_id, month);

alter table public.bills add constraint bills_status_check CHECK ((status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])));

alter table public.business_keys add constraint business_keys_salt_check CHECK (((length(salt) >= 16) AND (length(salt) <= 64)));

alter table public.business_keys add constraint business_keys_wpriv_check CHECK ((length(wpriv) < 1200));

alter table public.business_keys add constraint business_keys_wrapped_pw_check CHECK ((length(wrapped_pw) < 400));

alter table public.business_keys add constraint business_keys_wrapped_rc_check CHECK ((length(wrapped_rc) < 400));

alter table public.businesses add constraint businesses_area_check CHECK ((length(area) <= 120));

alter table public.businesses add constraint businesses_lbp_rate_check CHECK ((lbp_rate > (0)::numeric));

alter table public.businesses add constraint businesses_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120)));

alter table public.businesses add constraint businesses_phone_check CHECK ((length(phone) <= 30));

alter table public.businesses add constraint businesses_pub_check CHECK ((length(pub) <= 600));

alter table public.collectors add constraint collectors_name_enc_check CHECK (((length(name_enc) >= 20) AND (length(name_enc) <= 1200)));

alter table public.collectors add constraint collectors_wbk_check CHECK (((length(wbk) >= 20) AND (length(wbk) <= 400)));

alter table public.collectors add constraint collectors_wck_check CHECK (((length(wck) >= 20) AND (length(wck) <= 400)));

alter table public.notices add constraint notices_body_check CHECK ((length(body) <= 1000));

alter table public.notices add constraint notices_title_check CHECK (((length(title) >= 1) AND (length(title) <= 120)));

alter table public.payments add constraint payments_amount_check CHECK ((amount > (0)::numeric));

alter table public.payments add constraint payments_lbp_amount_check CHECK ((lbp_amount > (0)::numeric));

alter table public.payments add constraint payments_lbp_rate_check CHECK ((lbp_rate > (0)::numeric));

alter table public.payments add constraint payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'whish'::text, 'omt'::text, 'other'::text])));

alter table public.payments add constraint payments_note_check CHECK ((length(note) <= 600));

alter table public.readings add constraint readings_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric));

alter table public.readings add constraint readings_value_check CHECK ((value >= (0)::numeric));

alter table public.subscribers add constraint subscribers_amps_check CHECK (((amps >= 1) AND (amps <= 200)));

alter table public.subscribers add constraint subscribers_billing_type_check CHECK ((billing_type = ANY (ARRAY['metered'::text, 'flat'::text])));

alter table public.subscribers add constraint subscribers_enc_check CHECK (((length(enc) >= 20) AND (length(enc) <= 4000)));

alter table public.subscribers add constraint subscribers_initial_reading_check CHECK ((initial_reading >= (0)::numeric));

alter table public.subscribers add constraint subscribers_jk_check CHECK ((length(jk) < 1200));

alter table public.subscribers add constraint subscribers_oenc_check CHECK ((length(oenc) < 1200));

alter table public.subscribers add constraint subscribers_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'pending'::text, 'active'::text])));

alter table public.subscribers add constraint subscribers_wk_check CHECK ((length(wk) < 400));

alter table public.tariffs add constraint tariffs_fixed_fee_per_amp_check CHECK ((fixed_fee_per_amp >= (0)::numeric));

alter table public.tariffs add constraint tariffs_flat_amp_price_check CHECK ((flat_amp_price >= (0)::numeric));

alter table public.tariffs add constraint tariffs_kwh_price_check CHECK ((kwh_price >= (0)::numeric));

alter table public.tariffs add constraint tariffs_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric));

alter table public.bills add constraint bills_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table public.bills add constraint bills_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE;

alter table public.business_keys add constraint business_keys_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table public.businesses add constraint businesses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.collector_access add constraint collector_access_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES collectors(id) ON DELETE CASCADE;

alter table public.collector_access add constraint collector_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.collectors add constraint collectors_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table public.notices add constraint notices_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table public.payments add constraint payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;

alter table public.payments add constraint payments_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES collectors(id) ON DELETE SET NULL;

alter table public.readings add constraint readings_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE;

alter table public.subscriber_access add constraint subscriber_access_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE;

alter table public.subscriber_access add constraint subscriber_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.subscribers add constraint subscribers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

alter table public.tariffs add constraint tariffs_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

CREATE INDEX bills_business_id_month_idx ON public.bills USING btree (business_id, month);

CREATE INDEX collector_access_user_id_idx ON public.collector_access USING btree (user_id);

CREATE INDEX collectors_business_id_idx ON public.collectors USING btree (business_id);

CREATE INDEX notices_business_id_created_at_idx ON public.notices USING btree (business_id, created_at DESC);

CREATE INDEX payments_bill_id_idx ON public.payments USING btree (bill_id);

CREATE INDEX payments_collector_id_idx ON public.payments USING btree (collector_id);

CREATE INDEX subscriber_access_user_id_idx ON public.subscriber_access USING btree (user_id);

CREATE INDEX subscribers_business_id_idx ON public.subscribers USING btree (business_id);

CREATE INDEX subscribers_business_id_status_idx ON public.subscribers USING btree (business_id, status);

CREATE OR REPLACE FUNCTION private.guard_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_amount numeric(12,2); v_paid numeric(12,2); v_business uuid;
begin
  select amount, paid_amount, business_id into v_amount, v_paid, v_business from public.bills where id = new.bill_id for update;
  if new.amount > v_amount - v_paid then
    raise exception 'overpayment' using errcode = 'P0001';
  end if;
  new.collector_id := private.my_collector_id(v_business);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.is_business_owner(p_business uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.businesses where id = p_business and owner_id = (select auth.uid()));
$function$
;

CREATE OR REPLACE FUNCTION private.is_collector(p_business uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.my_collector_id(p_business) is not null;
$function$
;

CREATE OR REPLACE FUNCTION private.is_my_subscription(p_sub uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.subscriber_access a join public.subscribers s on s.id = a.subscriber_id
    where a.subscriber_id = p_sub and a.user_id = (select auth.uid()) and s.status = 'active');
$function$
;

CREATE OR REPLACE FUNCTION private.is_subscribed_to(p_business uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.subscriber_access a join public.subscribers s on s.id = a.subscriber_id
    where s.business_id = p_business and a.user_id = (select auth.uid()) and s.status = 'active');
$function$
;

CREATE OR REPLACE FUNCTION private.link_device(p_sub uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid());
begin
  insert into public.subscriber_access (subscriber_id, user_id) values (p_sub, v_uid) on conflict do nothing;
  delete from public.subscriber_access where subscriber_id = p_sub and user_id in (
    select user_id from public.subscriber_access where subscriber_id = p_sub order by created_at desc offset 5);
  update public.subscribers set devices = (select count(*) from public.subscriber_access where subscriber_id = p_sub) where id = p_sub;
end $function$
;

CREATE OR REPLACE FUNCTION private.my_collector_id(p_business uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id from public.collector_access a join public.collectors c on c.id = a.collector_id
  where a.user_id = (select auth.uid()) and c.business_id = p_business and c.active
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION private.owns_subscriber(p_sub uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.subscribers s join public.businesses b on b.id = s.business_id
    where s.id = p_sub and b.owner_id = (select auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION private.sync_bill_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bill uuid := coalesce(new.bill_id, old.bill_id);
  v_paid numeric(12,2);
  v_amount numeric(12,2);
begin
  select coalesce(sum(amount),0) into v_paid from public.payments where bill_id = v_bill;
  select amount into v_amount from public.bills where id = v_bill;
  update public.bills set paid_amount = v_paid,
    status = case when v_paid <= 0 then 'unpaid' when v_paid >= v_amount then 'paid' else 'partial' end
  where id = v_bill;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION private.valid_enc(p text, p_max integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p is not null and length(p) between 20 and p_max and p ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$';
$function$
;

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text, p_enc text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[A-Z0-9]{24}$' or not private.valid_enc(p_enc, 4000) then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  update public.subscribers set enc = p_enc, status = 'active', accepted_at = now()
    where invite_code = p_token and status = 'invited' returning id into v_id;
  if v_id is null then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  perform private.link_device(v_id);
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.approve_request(p_sub uuid, p_wk text, p_oenc text, p_amps integer, p_type text, p_initial numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.owns_subscriber(p_sub) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private.valid_enc(p_wk, 399) or (p_oenc is not null and not private.valid_enc(p_oenc, 1199))
     or p_amps is null or p_amps not between 1 and 200 or p_type not in ('metered','flat')
     or coalesce(p_initial, 0) < 0 then
    raise exception 'invalid_data' using errcode = 'P0001';
  end if;
  update public.subscribers set wk = p_wk, oenc = p_oenc, jk = null, amps = p_amps, billing_type = p_type,
    initial_reading = coalesce(p_initial, 0), status = 'active', accepted_at = now()
    where id = p_sub and status = 'pending';
  if not found then raise exception 'invalid_data' using errcode = 'P0001'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.collector_subscribers(p_business uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_collector(p_business) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'business_id', s.business_id, 'enc', s.enc, 'wk', s.wk, 'oenc', s.oenc, 'amps', s.amps,
    'billing_type', s.billing_type, 'active', s.active, 'status', s.status, 'initial_reading', s.initial_reading
  ) order by s.created_at), '[]'::jsonb)
  from public.subscribers s where s.business_id = p_business and s.status <> 'pending');
end $function$
;

CREATE OR REPLACE FUNCTION public.generate_bills(p_business uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        amount = v_amount
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
end $function$
;

CREATE OR REPLACE FUNCTION public.join_preview(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('name', b.name, 'area', b.area, 'pub', b.pub)
  from public.businesses b
  where (select auth.uid()) is not null and p_code ~ '^[A-Z0-9]{8}$' and b.join_code = p_code;
$function$
;

CREATE OR REPLACE FUNCTION public.my_collector_roles()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'business_id', c.business_id, 'name_enc', c.name_enc, 'wbk', c.wbk,
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'phone', b.phone, 'area', b.area, 'lbp_rate', b.lbp_rate)
  ) order by c.created_at), '[]'::jsonb)
  from public.collector_access a
  join public.collectors c on c.id = a.collector_id and c.active
  join public.businesses b on b.id = c.business_id
  where a.user_id = (select auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.my_subscriptions()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'business_id', s.business_id, 'status', s.status, 'enc', s.enc, 'amps', s.amps,
    'billing_type', s.billing_type, 'active', s.active,
    'business', jsonb_build_object('name', b.name, 'phone', b.phone, 'area', b.area, 'lbp_rate', b.lbp_rate)
  ) order by s.created_at), '[]'::jsonb)
  from public.subscriber_access a
  join public.subscribers s on s.id = a.subscriber_id
  join public.businesses b on b.id = s.business_id
  where a.user_id = (select auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.open_collector_invite(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[A-Z0-9]{24}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  select id into v_id from public.collectors where invite_code = p_token and active;
  if v_id is null then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  insert into public.collector_access (collector_id, user_id) values (v_id, v_uid) on conflict do nothing;
  delete from public.collector_access where collector_id = v_id and user_id in (
    select user_id from public.collector_access where collector_id = v_id order by created_at desc offset 5);
  update public.collectors set devices = (select count(*) from public.collector_access where collector_id = v_id) where id = v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.open_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.subscribers%rowtype; b public.businesses%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[A-Z0-9]{24}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  select * into s from public.subscribers where invite_code = p_token and status in ('invited','active');
  if not found then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  select * into b from public.businesses where id = s.business_id;
  if s.status = 'active' then
    perform private.link_device(s.id);
    return jsonb_build_object('state', 'linked', 'id', s.id);
  end if;
  return jsonb_build_object('state', 'confirm', 'id', s.id, 'enc', s.enc,
    'business', jsonb_build_object('name', b.name, 'area', b.area));
end $function$
;

CREATE OR REPLACE FUNCTION public.request_join(p_code text, p_enc text, p_jk text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_biz uuid; v_id uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if not private.valid_enc(p_enc, 4000) or p_jk is null or length(p_jk) not between 20 and 1199 then
    raise exception 'invalid_data' using errcode = 'P0001';
  end if;
  select id into v_biz from public.businesses where join_code = p_code and pub is not null;
  if v_biz is null then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if exists (select 1 from public.subscriber_access a join public.subscribers s on s.id = a.subscriber_id
             where a.user_id = v_uid and s.business_id = v_biz) then
    raise exception 'already_joined' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subscribers where business_id = v_biz and status = 'pending') >= 200 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  insert into public.subscribers (business_id, enc, jk, amps, billing_type, status)
    values (v_biz, p_enc, p_jk, 5, 'metered', 'pending') returning id into v_id;
  perform private.link_device(v_id);
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_collector_access(p_collector uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_code text := private.gen_code(24);
begin
  if not exists (select 1 from public.collectors c where c.id = p_collector and private.is_business_owner(c.business_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.collector_access where collector_id = p_collector;
  update public.collectors set invite_code = v_code, devices = 0 where id = p_collector;
  return v_code;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_subscriber_access(p_sub uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_code text := private.gen_code(24);
begin
  if not private.owns_subscriber(p_sub) then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from public.subscriber_access where subscriber_id = p_sub;
  update public.subscribers set invite_code = v_code, devices = 0 where id = p_sub;
  return v_code;
end $function$
;

CREATE OR REPLACE FUNCTION public.rotate_join_code(p_business uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_code text := private.gen_code(8);
begin
  if not private.is_business_owner(p_business) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.businesses set join_code = v_code where id = p_business;
  return v_code;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_my_info(p_sub uuid, p_enc text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_my_subscription(p_sub) or not private.valid_enc(p_enc, 4000) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.subscribers set enc = p_enc where id = p_sub;
end $function$
;

CREATE TRIGGER payments_guard BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.guard_payment();

CREATE TRIGGER payments_sync AFTER INSERT OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.sync_bill_paid();

alter table public.bills enable row level security;

alter table public.business_keys enable row level security;

alter table public.businesses enable row level security;

alter table public.collector_access enable row level security;

alter table public.collectors enable row level security;

alter table public.notices enable row level security;

alter table public.payments enable row level security;

alter table public.readings enable row level security;

alter table public.subscriber_access enable row level security;

alter table public.subscribers enable row level security;

alter table public.tariffs enable row level security;

create policy bill_collector_read on public.bills as permissive for select to authenticated
  using (private.is_collector(business_id));

create policy bill_owner_delete on public.bills as permissive for delete to authenticated
  using ((private.is_business_owner(business_id) AND (paid_amount = (0)::numeric)));

create policy bill_owner_read on public.bills as permissive for select to authenticated
  using (private.is_business_owner(business_id));

create policy bill_self_read on public.bills as permissive for select to authenticated
  using (private.is_my_subscription(subscriber_id));

create policy keys_owner_all on public.business_keys as permissive for all to authenticated
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));

create policy biz_no_anon on public.businesses as restrictive for insert to authenticated
  with check ((COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false) = false));

create policy biz_owner_all on public.businesses as permissive for all to authenticated
  using ((owner_id = ( SELECT auth.uid() AS uid)))
  with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy collectors_owner_all on public.collectors as permissive for all to authenticated
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));

create policy notice_owner_all on public.notices as permissive for all to authenticated
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));

create policy notice_subscriber_read on public.notices as permissive for select to authenticated
  using (private.is_subscribed_to(business_id));

create policy pay_collector_delete on public.payments as permissive for delete to authenticated
  using (((collector_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND (private.my_collector_id(b.business_id) = payments.collector_id))))));

create policy pay_collector_insert on public.payments as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND private.is_collector(b.business_id)))));

create policy pay_collector_read on public.payments as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND private.is_collector(b.business_id)))));

create policy pay_owner_delete on public.payments as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND private.is_business_owner(b.business_id)))));

create policy pay_owner_insert on public.payments as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND private.is_business_owner(b.business_id)))));

create policy pay_owner_read on public.payments as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND private.is_business_owner(b.business_id)))));

create policy pay_self_read on public.payments as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND private.is_my_subscription(b.subscriber_id)))));

create policy reading_owner_all on public.readings as permissive for all to authenticated
  using (private.owns_subscriber(subscriber_id))
  with check (private.owns_subscriber(subscriber_id));

create policy reading_self_read on public.readings as permissive for select to authenticated
  using (private.is_my_subscription(subscriber_id));

create policy sub_owner_all on public.subscribers as permissive for all to authenticated
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));

create policy tariff_owner_all on public.tariffs as permissive for all to authenticated
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));

create policy tariff_subscriber_read on public.tariffs as permissive for select to authenticated
  using (private.is_subscribed_to(business_id));

grant delete, select on public.bills to authenticated;

grant insert, select on public.business_keys to authenticated;

grant delete, select on public.businesses to authenticated;

grant delete, select on public.collectors to authenticated;

grant delete, insert, select on public.notices to authenticated;

grant delete, select on public.payments to authenticated;

grant delete, insert, select on public.readings to authenticated;

grant delete, select on public.subscribers to authenticated;

grant delete, insert, select on public.tariffs to authenticated;

grant update (salt, updated_at, wpriv, wrapped_pw, wrapped_rc) on public.business_keys to authenticated;

grant insert (area, lbp_rate, name, owner_id, phone) on public.businesses to authenticated;

grant update (area, lbp_rate, name, phone, pub) on public.businesses to authenticated;

grant insert (business_id, name_enc, wbk, wck) on public.collectors to authenticated;

grant update (active, name_enc) on public.collectors to authenticated;

grant update (body, title) on public.notices to authenticated;

grant insert (amount, bill_id, lbp_amount, lbp_rate, method, note, paid_at) on public.payments to authenticated;

grant update (value) on public.readings to authenticated;

grant insert (active, amps, billing_type, business_id, enc, initial_reading, oenc, wk) on public.subscribers to authenticated;

grant update (active, amps, billing_type, enc, initial_reading, oenc, wk) on public.subscribers to authenticated;

grant update (fixed_fee_per_amp, flat_amp_price, kwh_price) on public.tariffs to authenticated;

revoke execute on function private.gen_code(integer) from public, anon, authenticated;

revoke execute on function private.guard_payment() from public, anon, authenticated;

revoke execute on function private.is_business_owner(uuid) from public, anon, authenticated;

revoke execute on function private.is_collector(uuid) from public, anon, authenticated;

revoke execute on function private.is_my_subscription(uuid) from public, anon, authenticated;

revoke execute on function private.is_subscribed_to(uuid) from public, anon, authenticated;

revoke execute on function private.link_device(uuid) from public, anon, authenticated;

revoke execute on function private.my_collector_id(uuid) from public, anon, authenticated;

revoke execute on function private.owns_subscriber(uuid) from public, anon, authenticated;

revoke execute on function private.sync_bill_paid() from public, anon, authenticated;

revoke execute on function private.valid_enc(text, integer) from public, anon, authenticated;

revoke execute on function public.accept_invite(text, text) from public, anon, authenticated;

revoke execute on function public.approve_request(uuid, text, text, integer, text, numeric) from public, anon, authenticated;

revoke execute on function public.collector_subscribers(uuid) from public, anon, authenticated;

revoke execute on function public.generate_bills(uuid, date) from public, anon, authenticated;

revoke execute on function public.join_preview(text) from public, anon, authenticated;

revoke execute on function public.my_collector_roles() from public, anon, authenticated;

revoke execute on function public.my_subscriptions() from public, anon, authenticated;

revoke execute on function public.open_collector_invite(text) from public, anon, authenticated;

revoke execute on function public.open_invite(text) from public, anon, authenticated;

revoke execute on function public.request_join(text, text, text) from public, anon, authenticated;

revoke execute on function public.reset_collector_access(uuid) from public, anon, authenticated;

revoke execute on function public.reset_subscriber_access(uuid) from public, anon, authenticated;

revoke execute on function public.rotate_join_code(uuid) from public, anon, authenticated;

revoke execute on function public.update_my_info(uuid, text) from public, anon, authenticated;

grant execute on function private.gen_code(integer) to authenticated;

grant execute on function private.is_business_owner(uuid) to authenticated;

grant execute on function private.is_collector(uuid) to authenticated;

grant execute on function private.is_my_subscription(uuid) to authenticated;

grant execute on function private.is_subscribed_to(uuid) to authenticated;

grant execute on function private.my_collector_id(uuid) to authenticated;

grant execute on function private.owns_subscriber(uuid) to authenticated;

grant execute on function public.accept_invite(text, text) to authenticated;

grant execute on function public.approve_request(uuid, text, text, integer, text, numeric) to authenticated;

grant execute on function public.collector_subscribers(uuid) to authenticated;

grant execute on function public.generate_bills(uuid, date) to authenticated;

grant execute on function public.join_preview(text) to authenticated;

grant execute on function public.my_collector_roles() to authenticated;

grant execute on function public.my_subscriptions() to authenticated;

grant execute on function public.open_collector_invite(text) to authenticated;

grant execute on function public.open_invite(text) to authenticated;

grant execute on function public.request_join(text, text, text) to authenticated;

grant execute on function public.reset_collector_access(uuid) to authenticated;

grant execute on function public.reset_subscriber_access(uuid) to authenticated;

grant execute on function public.rotate_join_code(uuid) to authenticated;

grant execute on function public.update_my_info(uuid, text) to authenticated;
