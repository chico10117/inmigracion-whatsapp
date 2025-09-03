-- =====================================================================
-- Core relational schema for WhatsApp immigration bot
-- - users: one row per phone number (our canonical identity)
-- - conversations: sessions per user (used to group messages over time)
-- - messages: every inbound/outbound message with metadata
-- - payments: Stripe events (for top-ups)
-- - credit_ledger: audit log for credit changes
-- - metrics_daily: simple aggregated view for quick dashboards
-- All statements are idempotent where possible so re-running is safe.
-- =====================================================================

-- Usuarios: información principal por cada número de teléfono
-- Guardamos el número en formato E.164 y banderas básicas del usuario
-- (idioma, créditos iniciales y si está bloqueado)
-- Nota: usamos gen_random_uuid() → requiere la extensión pgcrypto
--       (activada en 4b o manualmente antes de crear estas tablas).
--       created_at se establece por defecto a now().
--       phone_e164 es único por usuario.
--
-- Tabla: public.users
-- ---------------------------------------------------------------------
-- id:             UUID primario
-- phone_e164:     Número en formato +34123456789 (único y requerido)
-- created_at:     Fecha de alta
-- lang:           Idioma preferido (por defecto 'es')
-- credits_cents:  Saldo en céntimos para el sistema de créditos futuro
-- is_blocked:     Flag para banear usuarios problemáticos
-- ---------------------------------------------------------------------
-- Usuarios
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique not null,          -- +34600111222
  created_at timestamptz default now(),
  lang text default 'es',
  credits_cents int not null default 300,   -- €3 iniciales
  is_blocked boolean default false
);

-- Conversaciones: sesión lógica por usuario
-- Cada conversación agrupa mensajes en una ventana temporal.
-- c.user_id referencia a users(id) con borrado en cascada.
-- started_at:   cuándo empezó la conversación
-- last_msg_at:  última actividad (para encontrar la activa)
--
-- Tabla: public.conversations
-- ---------------------------------------------------------------------
-- id:            UUID primario
-- user_id:       FK → users.id (on delete cascade)
-- started_at:    Inicio de conversación
-- last_msg_at:   Último mensaje (para ordenar/filtrar por actividad)
-- ---------------------------------------------------------------------
-- Conversaciones
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz default now(),
  last_msg_at timestamptz
);

-- Mensajes: cada mensaje enviado/recibido
-- conversation_id: FK hacia conversations(id), borra en cascada
-- role:             'user' | 'assistant' | 'system'
-- content:          texto del mensaje
-- tokens_input/output: contabilidad opcional de tokens LLM
-- cost_cents:       coste IA asociado (si aplica)
-- created_at:       marca temporal
--
-- Tabla: public.messages
-- ---------------------------------------------------------------------
-- id:               UUID primario
-- conversation_id:  FK → conversations.id (cascade)
-- role:             actor del mensaje (check de valores permitidos)
-- content:          cuerpo del mensaje
-- tokens_input:     tokens de entrada
-- tokens_output:    tokens de salida
-- cost_cents:       coste en céntimos
-- created_at:       timestamp de creación
-- ---------------------------------------------------------------------
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

-- Pagos: registro de eventos de Stripe (u otra pasarela)
-- stripe_event_id: idempotencia (único) para no duplicar
-- status: estado del pago
--
-- Tabla: public.payments
-- ---------------------------------------------------------------------
-- id:             UUID primario
-- user_id:        FK → users.id (cascade)
-- stripe_event_id:identificador único del evento de pasarela
-- amount_cents:   cantidad en céntimos
-- created_at:     timestamp de creación
-- status:         'succeeded' | 'failed' | 'pending'
-- ---------------------------------------------------------------------
-- Pagos
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_event_id text unique,
  amount_cents int not null,
  created_at timestamptz default now(),
  status text check (status in ('succeeded','failed','pending')) default 'succeeded'
);

-- Ledger de créditos: auditoría de movimientos del saldo
-- reason: motivo del apunte (texto controlado por la app)
-- ref_id: referencia opcional (p.ej. id de mensaje o pago)
--
-- Tabla: public.credit_ledger
-- ---------------------------------------------------------------------
-- id:          UUID primario
-- user_id:     FK → users.id (cascade)
-- delta_cents: variación de créditos (+/-)
-- reason:      motivo ('init_grant' | 'stripe_topup' | 'chat_spend')
-- ref_id:      referencia opcional
-- created_at:  timestamp
-- ---------------------------------------------------------------------
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
-- metrics_daily: vista de agregados por día
-- - day:          truncamos a día usando el created_at del mensaje si hay,
--                 si no, el del usuario (u.created_at) para contar altas
-- - new_users_est:aprox. de altas con créditos iniciales (u.credits_cents=300)
-- - user_msgs:    nº de mensajes de rol 'user' en ese día
-- - ia_cost_cents:coste sumado de mensajes de ese día
-- Nota: usamos COALESCE(m.created_at, u.created_at) para evitar ambigüedad.
drop view if exists public.metrics_daily;
create or replace view public.metrics_daily as
select
  date_trunc('day', coalesce(m.created_at, u.created_at)) as day,
  count(distinct u.phone_e164) filter (where u.credits_cents=300) as new_users_est,
  count(*) filter (where m.role='user') as user_msgs,
  coalesce(sum(m.cost_cents), 0) as ia_cost_cents
from public.users u
left join public.conversations c on c.user_id=u.id
left join public.messages m on m.conversation_id=c.id
group by 1
order by 1 desc;