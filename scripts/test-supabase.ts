import 'dotenv/config'
import { ensureUser } from '../src/domain/credit'
import { addUserMessage, addAssistantMessage } from '../src/domain/conversation'
import { supa } from '../src/db/supabase'

async function main() {
  const phone = '+34999000111'
  const user = await ensureUser(phone)
  if (!user || !supa) {
    console.error('Supabase not configured or user creation failed')
    process.exit(1)
  }
  console.log('user', user.id)

  await addUserMessage(phone, 'Hola, prueba de mensaje del usuario.')
  await addAssistantMessage(phone, 'Respuesta de prueba del asistente.')

  // Allow background persistence to complete
  await new Promise((resolve) => setTimeout(resolve, 750))

  const { data: conv } = await supa
    .from('conversations')
    .select('id,last_msg_at')
    .eq('user_id', user.id)
    .order('last_msg_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const { data: msgs } = await supa
    .from('messages')
    .select('role,content,created_at')
    .eq('conversation_id', conv?.id as string)
    .order('created_at', { ascending: true })

  console.log('conv', conv)
  console.log('msgs', msgs)
}

main().catch((e) => { console.error(e); process.exit(1) })
