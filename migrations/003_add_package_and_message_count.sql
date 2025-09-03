-- Add package and message_count columns to users, if missing
alter table public.users
  add column if not exists package text not null default 'free';

-- Constrain package to allowed values
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_package_allowed_values'
  ) then
    alter table public.users
      add constraint users_package_allowed_values
      check (package in ('free','5','10','15'));
  end if;
end $$;

-- Ensure message_count exists for current usage tracking system
alter table public.users
  add column if not exists message_count int not null default 0;

-- Helpful indexes for analytics and joins
create index if not exists idx_conversations_user_id on public.conversations(user_id);
create index if not exists idx_conversations_last_msg_at on public.conversations(last_msg_at);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_credit_ledger_user_id on public.credit_ledger(user_id);



