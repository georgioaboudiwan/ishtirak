create or replace function public.my_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  with subs as (
    select s.id from public.subscriber_access a join public.subscribers s on s.id = a.subscriber_id
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
        and c.month = date_trunc('month', (now() at time zone 'Asia/Beirut'))::date), '[]'::jsonb)
  );
$$;

create or replace function public.collector_home(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_collector(p_business) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'people', public.collector_subscribers(p_business),
    'open', coalesce((select jsonb_agg(private.bill_json(b)) from public.bills b where b.business_id = p_business and b.status <> 'paid'), '[]'::jsonb)
  );
end $$;

revoke all on function public.my_home(), public.collector_home(uuid) from public, anon;
grant execute on function public.my_home(), public.collector_home(uuid) to authenticated;
