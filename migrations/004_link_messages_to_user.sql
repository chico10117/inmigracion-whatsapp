-- Vincula cada mensaje directamente con el usuario para facilitar
-- consultas (reconstrucción de conversaciones por usuario, auditoría)
-- y añade índices para rendimiento e idempotencia.
-- Todas las operaciones son idempotentes donde aplica.
-- Link messages directly to users and add idempotent indexes

-- Añade columnas si no existen:
--  - user_id:   FK a users.id para acceso directo
--  - wa_message_id: id opcional del mensaje de WhatsApp (para deduplicar)
-- 1) Add user_id + wa_message_id columns if missing
alter table public.messages
  add column if not exists user_id uuid,
  add column if not exists wa_message_id text;

-- Rellena user_id a partir de conversations.user_id
-- 2) Backfill user_id from conversations
update public.messages m
set user_id = c.user_id
from public.conversations c
where m.conversation_id = c.id
  and m.user_id is null;

-- Asegura la FK (si no existe) y después establece NOT NULL
-- 3) Enforce FK + NOT NULL on user_id
do $$
begin
  -- Add FK if not present
  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.table_schema = 'public'
      and tc.table_name = 'messages'
      and tc.constraint_type = 'FOREIGN KEY'
      and tc.constraint_name = 'messages_user_id_fkey'
  ) then
    alter table public.messages
      add constraint messages_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- Solo establecemos NOT NULL cuando ya hay datos y FK
-- Only set NOT NULL after backfill and FK are in place
alter table public.messages
  alter column user_id set not null;

-- Índices:
--  - (user_id, created_at desc): reconstrucción rápida por usuario
--  - unique(wa_message_id where not null): deduplicación idempotente
-- 4) Indexes for query and dedupe patterns
create index if not exists idx_messages_user_created_at
  on public.messages(user_id, created_at desc);

create unique index if not exists uq_messages_wa_message_id
  on public.messages(wa_message_id)
  where wa_message_id is not null;


