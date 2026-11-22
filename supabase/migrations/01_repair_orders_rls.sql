-- Hard R Cycles: Flat Rate Panic — Repair Orders Leaderboard & RLS
-- Safe to run on fresh Supabase Postgres databases

create table if not exists public.repair_orders (
  id uuid default gen_random_uuid() primary key,
  mechanic_name text not null,
  billed_hours numeric(5,2) not null,
  actual_hours numeric(5,2) not null,
  efficiency_rating numeric(5,2) not null,
  shop_damage_cost numeric(10,2) not null,
  rank_badge text not null default 'Shop Wrench',
  jobs_completed smallint not null default 4,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  constraint repair_orders_name_check check (char_length(btrim(mechanic_name)) between 1 and 24),
  constraint repair_orders_billed_check check (billed_hours > 0 and billed_hours <= 50),
  constraint repair_orders_actual_check check (actual_hours > 0 and actual_hours <= 100),
  constraint repair_orders_efficiency_check check (efficiency_rating between 0 and 300),
  constraint repair_orders_damage_check check (shop_damage_cost >= 0 and shop_damage_cost <= 100000),
  constraint repair_orders_jobs_check check (jobs_completed between 0 and 10),
  constraint repair_orders_badge_check check (char_length(btrim(rank_badge)) between 1 and 40)
);

create index if not exists repair_orders_leaderboard_idx
  on public.repair_orders (efficiency_rating desc, shop_damage_cost asc, created_at desc);

grant usage on schema public to anon, authenticated;
grant select, insert on public.repair_orders to anon, authenticated;

alter table public.repair_orders enable row level security;

drop policy if exists "Anyone can view leaderboard" on public.repair_orders;
create policy "Anyone can view leaderboard"
  on public.repair_orders
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Validated inserts via API or anon" on public.repair_orders;
create policy "Validated inserts via API or anon"
  on public.repair_orders
  for insert
  to anon, authenticated
  with check (
    char_length(btrim(mechanic_name)) between 1 and 24
    and billed_hours > 0
    and billed_hours <= 50
    and actual_hours > 0
    and actual_hours <= 100
    and efficiency_rating between 0 and 300
    and shop_damage_cost >= 0
    and shop_damage_cost <= 100000
    and jobs_completed between 0 and 10
    and char_length(btrim(rank_badge)) between 1 and 40
  );

insert into public.repair_orders (
  mechanic_name,
  billed_hours,
  actual_hours,
  efficiency_rating,
  shop_damage_cost,
  rank_badge,
  jobs_completed
)
select
  v.mechanic_name,
  v.billed_hours,
  v.actual_hours,
  v.efficiency_rating,
  v.shop_damage_cost,
  v.rank_badge,
  v.jobs_completed
from (
  values
    ('Big Dale', 7.00::numeric, 4.95::numeric, 141.41::numeric, 45.00::numeric, 'Flat Rate Legend', 4::smallint),
    ('10mm Johnny', 7.00::numeric, 6.10::numeric, 114.75::numeric, 140.00::numeric, 'Certified Bay Ripper', 4::smallint),
    ('JB Weld Rick', 7.00::numeric, 6.85::numeric, 102.19::numeric, 320.00::numeric, 'Master of JB Weld', 4::smallint),
    ('Rookie Tim', 7.00::numeric, 8.75::numeric, 80.00::numeric, 590.00::numeric, 'Warranty Voided', 4::smallint)
) as v(mechanic_name, billed_hours, actual_hours, efficiency_rating, shop_damage_cost, rank_badge, jobs_completed)
where not exists (select 1 from public.repair_orders limit 1);
