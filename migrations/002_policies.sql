-- =====================================================================
-- Seguridad por filas (RLS) y políticas de servicio
-- - Habilitamos RLS en todas las tablas
-- - Creamos políticas extremadamente permisivas para el rol de servicio
--   (la app del backend usa SUPABASE_SERVICE_ROLE_KEY)
-- - IMPORTANTE: No usar estas políticas desde un cliente público con anon key
-- =====================================================================
-- Activar RLS
alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.credit_ledger enable row level security;

-- Política de servicio (backend) mediante service_role (todo permitido)
create policy "service_read_all" on public.users
for select using (true);

create policy "service_write_all" on public.users
for all using (true) with check (true);

-- Repetir para las demás tablas (todo permitido para service_role):
create policy "service_all_conversations" on public.conversations 
for all using (true) with check (true);

create policy "service_all_messages" on public.messages 
for all using (true) with check (true);

create policy "service_all_payments" on public.payments 
for all using (true) with check (true);

create policy "service_all_ledger" on public.credit_ledger 
for all using (true) with check (true);