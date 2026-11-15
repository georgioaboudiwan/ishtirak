create index if not exists payment_claims_bill_idx on public.payment_claims (bill_id);
create index if not exists payment_claims_sub_idx on public.payment_claims (subscriber_id);
create index if not exists push_queue_business_idx on public.push_queue (business_id);
create index if not exists push_queue_sub_idx on public.push_queue (subscriber_id);
drop index if exists public.app_logs_notified_idx;

create or replace function private.bill_json(b public.bills) returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(b) || jsonb_build_object('payments', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'bill_id', p.bill_id, 'amount', p.amount, 'method', p.method, 'note', p.note,
      'paid_at', p.paid_at, 'collector_id', p.collector_id, 'lbp_amount', p.lbp_amount, 'lbp_rate', p.lbp_rate) order by p.paid_at)
    from public.payments p where p.bill_id = b.id), '[]'::jsonb));
$$;

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
    'read_claims', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.reading_claims c where c.business_id = p_business and c.status = 'pending'), '[]'::jsonb)
  );
end $$;

create or replace function public.app_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', (select to_jsonb(b) from public.businesses b where b.owner_id = (select auth.uid())),
    'subscriptions', public.my_subscriptions(),
    'roles', public.my_collector_roles(),
    'admin', private.is_admin()
  );
$$;

revoke all on function private.bill_json(public.bills) from public, anon, authenticated;
revoke all on function public.owner_home(uuid, date), public.app_context() from public, anon;
grant execute on function public.owner_home(uuid, date), public.app_context() to authenticated;
