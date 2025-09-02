-- Usuarios
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique not null,          -- +34600111222
  created_at timestamptz default now(),
  lang text default 'es',
  credits_cents int not null default 300,   -- €3 iniciales
  is_blocked boolean default false
);

-- Conversaciones
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz default now(),
  last_msg_at timestamptz
);

-- Mensajes
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text check (role in ('user','assistant','system')) not null,
  content text not null,
  tokens_input int default 0,
  tokens_output int default 0,
  cost_cents int default 0,
  created_at timestamptz default now()
);

-- Pagos
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_event_id text unique,
  amount_cents int not null,
  created_at timestamptz default now(),
  status text check (status in ('succeeded','failed','pending')) default 'succeeded'
);

-- Ledger de créditos
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta_cents int not null,
  reason text not null,     -- 'init_grant' | 'stripe_topup' | 'chat_spend'
  ref_id uuid,
  created_at timestamptz default now()
);

-- Vistas métricas simples
create view public.metrics_daily as
select
  date_trunc('day', created_at) as day,
  count(distinct phone_e164) filter (where credits_cents=300) as new_users_est,
  count(*) filter (where role='user') as user_msgs,
  sum(cost_cents) as ia_cost_cents
from public.users u
left join public.conversations c on c.user_id=u.id
left join public.messages m on m.conversation_id=c.id
group by 1
order by 1 desc;