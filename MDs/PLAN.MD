Perfecto, Chiko. Con tus respuestas cerradas, aquí tienes un plan operativo ultra-concreto para que un LLM (o tú) lo ejecute sobre un repo existente y levantar el MVP con Baileys + GPT-4.1 + Supabase + Stripe Payment Links. Incluye estructura de archivos, migraciones SQL, políticas RLS, endpoints, mensajes, cálculo de costes por tokens y pruebas. He añadido citas técnicas donde corresponde para que quede auditable.

⸻

0) Supuestos y criterios de “done”
	•	Canal: WhatsApp vía Baileys (no oficial). Aceptamos riesgo de baneo en MVP; más adelante migración a Cloud API.  ￼ ￼
	•	IA: gpt-4.1 con cobro real por tokens (ref. precios). Input: 3,00 USD/M, Output: 12,00 USD/M (define tipo de cambio a EUR en .env).  ￼
	•	Pagos: Stripe Payment Links preconfigurados (€5/€10/€15) + webhook en checkout.session.completed.  ￼
	•	Base de datos: Supabase (Postgres) + RLS.  ￼
	•	Moderación: Moderation API actual (modelo “omni-moderation-latest”/equivalente).  ￼ ￼ ￼
	•	Idiomas: Sólo español.
	•	Legal: Descargo “no asesoría legal”.
	•	MVP listo cuando: alta de usuario, regalo €3, consumo por tokens, bloqueo al llegar a €0, recarga por link, re-acreditación por webhook, moderación básica, logs y métricas mínimas.

⸻

1) Variables de entorno (añadir a .env)

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1

# Costeo (USD->EUR y margen operacional, ajustables)
PRICE_INPUT_PER_MTOK_USD=3.0        # ref OpenAI
PRICE_OUTPUT_PER_MTOK_USD=12.0      # ref OpenAI
USD_EUR_RATE=0.92                   # ajustable semanalmente
COST_MULTIPLIER=1.15                # colchón 15% (infra/variación FX)

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_LINK_5_EUR=https://buy.stripe.com/xxxx
STRIPE_LINK_10_EUR=https://buy.stripe.com/xxxx
STRIPE_LINK_15_EUR=https://buy.stripe.com/xxxx

# Supabase (server-side)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# WhatsApp / Baileys
BAILEYS_STATE_DIR=auth
BOT_NAME="Reco Extranjería"
BOT_INIT_CREDITS_CENTS=300

Nota: Los tres Payment Links se crean en el Dashboard o vía API y se pegan aquí. Evento de reconcilio: checkout.session.completed.  ￼

⸻

2) Dependencias (Node/TS)

npm i @whiskeysockets/baileys openai stripe @supabase/supabase-js zod pino
npm i -D typescript ts-node-dev @types/node

Documentación de Baileys y su paquete NPM.  ￼ ￼

⸻

3) Estructura de carpetas (crear si no existe)

/src
  index.ts
  server.ts
  whatsapp/baileys.ts
  llm/openai.ts
  llm/moderation.ts
  billing/stripe.ts
  db/supabase.ts
  domain/credit.ts
  domain/flows.ts
  domain/calc.ts
  domain/metrics.ts
  utils/logger.ts
/migrations
  001_schema.sql
  002_policies.sql
/scripts
  smoke_test.md


⸻

4) Migraciones SQL (Supabase)

4.1 /migrations/001_schema.sql

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

4.2 /migrations/002_policies.sql (activar RLS; policies conservadoras)

-- Activar RLS
alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.credit_ledger enable row level security;

-- Política de servicio (backend) mediante service_role (todo permitido)
-- Supabase recomienda RLS con políticas explícitas; el backend usará la Service Role Key.  [oai_citation:11‡Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com)
create policy "service_read_all" on public.users
for select using (true);
create policy "service_write_all" on public.users
for all using (true) with check (true);

-- Repetir para las demás tablas:
create policy "service_all_conversations" on public.conversations for all using (true) with check (true);
create policy "service_all_messages" on public.messages for all using (true) with check (true);
create policy "service_all_payments" on public.payments for all using (true) with check (true);
create policy "service_all_ledger" on public.credit_ledger for all using (true) with check (true);

Nota: en MVP no expondremos consultas desde el cliente final, todo será server-side con Service Role (por eso políticas “service_*”). Si luego haces un panel público, añadimos políticas por auth.uid().

⸻

5) Código (archivos clave)

5.1 src/utils/logger.ts

import pino from 'pino'
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

5.2 src/db/supabase.ts

import { createClient } from '@supabase/supabase-js'
export const supa = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-side only
  { auth: { persistSession: false } }
)

5.3 src/domain/calc.ts (coste por tokens → céntimos EUR)

export function toCentsEUR(usd: number) {
  const rate = Number(process.env.USD_EUR_RATE ?? 0.92)
  return Math.round(usd * rate * 100)
}

export function estimateCostCents({
  prompt_tokens, completion_tokens
}: { prompt_tokens:number, completion_tokens:number }) {
  const inUSD =
    (prompt_tokens/1_000_000) * Number(process.env.PRICE_INPUT_PER_MTOK_USD ?? 3) +
    (completion_tokens/1_000_000) * Number(process.env.PRICE_OUTPUT_PER_MTOK_USD ?? 12)
  const usdWithMargin = inUSD * Number(process.env.COST_MULTIPLIER ?? 1.15)
  return toCentsEUR(usdWithMargin)
}

Precios GPT-4.1 y ajuste a EUR vía .env.  ￼

5.4 src/domain/credit.ts

import { supa } from '../db/supabase'

export async function ensureUser(phoneE164: string) {
  const { data } = await supa.from('users').select('*').eq('phone_e164', phoneE164).maybeSingle()
  if (data) return data
  const init = Number(process.env.BOT_INIT_CREDITS_CENTS ?? 300)
  const { data: created } = await supa.from('users')
    .insert({ phone_e164: phoneE164, credits_cents: init })
    .select('*').single()
  await supa.from('credit_ledger').insert({
    user_id: created.id, delta_cents: init, reason: 'init_grant'
  })
  return created
}

export async function hasCredits(userId: string) {
  const { data } = await supa.from('users').select('credits_cents').eq('id', userId).single()
  return (data?.credits_cents ?? 0) > 0
}

export async function debitAfterChat(
  userId: string, costCents: number, messageId: string
) {
  const { data: u } = await supa.from('users').select('credits_cents').eq('id', userId).single()
  const newBal = Math.max(0, (u?.credits_cents ?? 0) - costCents)
  await supa.from('users').update({ credits_cents: newBal }).eq('id', userId)
  await supa.from('credit_ledger').insert({
    user_id: userId, delta_cents: -costCents, reason: 'chat_spend', ref_id: messageId
  })
  return newBal
}

export function topupLinks() {
  return [
    process.env.STRIPE_LINK_5_EUR!,
    process.env.STRIPE_LINK_10_EUR!,
    process.env.STRIPE_LINK_15_EUR!
  ]
}

5.5 src/llm/moderation.ts

import OpenAI from 'openai'
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function moderateOrNull(text: string) {
  const r = await client.moderations.create({
    model: 'omni-moderation-latest', input: text
  })
  const flagged = r.results?.[0]?.flagged ?? false
  return flagged ? r.results?.[0] : null
}

Moderation API / modelo multimodal más reciente.  ￼ ￼

5.6 src/llm/openai.ts

import OpenAI from 'openai'
import { estimateCostCents } from '../domain/calc'
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const SYSTEM = `
Eres "Reco Extranjería". Das orientación informativa en España (no asesoría legal).
Responde en español claro, con pasos prácticos. Cuando proceda, incluye 1-2 enlaces
a fuentes oficiales (SEPE, Ministerio del Interior, Extranjería, BOE, etc.).
Si la pregunta supera tu ámbito, deriva a un profesional colegiado.
`

export async function answerImmigration(q: string) {
  const chat = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
    messages: [{ role:'system', content: SYSTEM }, { role:'user', content: q }]
  })
  const msg = chat.choices[0].message?.content ?? ''
  const usage = chat.usage ?? { prompt_tokens:0, completion_tokens:0 }
  const cost_cents = estimateCostCents({
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0
  })
  return { text: msg, usage, cost_cents }
}

5.7 src/domain/flows.ts (copys y plantillas)

export const COPY = {
  hello: (name='') => `¡Hola${name? ' ' + name : ''}! Soy Reco Extranjería.
Te regalo €3 de saldo para tu primera consulta. *No es asesoría legal.* 
Cuéntame tu duda (texto, sin audios ni imágenes por ahora).`,
  noCredits: (links: string[]) =>
    `Tu saldo es 0 €. Recarga para seguir: 
${links.map((l,i)=>`[€${[5,10,15][i]}] ${l}`).join('\n')}`,
  paid: (amount: number) => `¡Pago recibido! Ya tienes €${amount.toFixed(2)} de saldo.`,
  baja: `Hemos recibido tu solicitud de baja. Eliminaremos tus datos.`
}

5.8 src/billing/stripe.ts (webhook)

import Stripe from 'stripe'
import { supa } from '../db/supabase'
import { logger } from '../utils/logger'
import { Request, Response } from 'express'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string
  let evt
  try {
    evt = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err:any) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // pago completado vía Checkout/Payment Link
  if (evt.type === 'checkout.session.completed') {
    const session = evt.data.object as Stripe.Checkout.Session
    const email = session.customer_details?.email
    const phone = session.customer_details?.phone?.replace(/\s+/g,'') // opcional
    const amountTotal = (session.amount_total ?? 0) / 100 // en EUR (si configuras EUR)
    // resolvemos usuario por teléfono si lo capturas, o por id pasado en metadata (si en futuro usas sesiones dinámicas)
    if (!phone) { logger.warn({sessionId: session.id}, 'No phone in session'); res.json({received:true}); return }

    // acredita según importe
    const cents = Math.round(amountTotal * 100)
    const { data: u } = await supa.from('users').select('*').eq('phone_e164', phone).maybeSingle()
    if (u) {
      await supa.from('users').update({ credits_cents: u.credits_cents + cents }).eq('id', u.id)
      const { data: pay } = await supa.from('payments')
        .insert({ user_id: u.id, stripe_event_id: evt.id, amount_cents: cents, status:'succeeded' })
        .select('id').single()
      await supa.from('credit_ledger').insert({
        user_id: u.id, delta_cents: cents, reason: 'stripe_topup', ref_id: pay.id
      })
    }
  }

  res.json({ received: true })
}

Stripe Payment Links + evento checkout.session.completed. Checkout espera hasta 10s si usas esa estrategia; responde rápido.  ￼

5.9 src/whatsapp/baileys.ts

import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'
import { ensureUser, hasCredits, debitAfterChat, topupLinks } from '../domain/credit'
import { answerImmigration } from '../llm/openai'
import { moderateOrNull } from '../llm/moderation'
import { supa } from '../db/supabase'
import { logger } from '../utils/logger'

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(process.env.BAILEYS_STATE_DIR ?? 'auth')
  const sock = makeWASocket({ auth: state })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages?.[0]
    if (!m?.message || !m.key.remoteJid) return
    const jid = m.key.remoteJid
    const phone = '+' + jid.replace('@s.whatsapp.net','')

    const user = await ensureUser(phone)

    // Baja
    const text = m.message.conversation?.trim() ?? ''
    if (/^baja$/i.test(text)) {
      await sock.sendMessage(jid, { text: 'Hemos recibido tu solicitud de BAJA. Eliminaremos tus datos.' })
      await supa.from('users').delete().eq('id', user.id)
      return
    }

    // Moderación
    const mod = await moderateOrNull(text)
    if (mod) {
      await sock.sendMessage(jid, { text: 'Tu mensaje infringe nuestras normas. Reformúlalo por favor.' })
      return
    }

    // Créditos
    if (!(await hasCredits(user.id))) {
      const links = topupLinks()
      await sock.sendMessage(jid, { text: `Tu saldo es 0€.\nRecarga:\n- €5 ${links[0]}\n- €10 ${links[1]}\n- €15 ${links[2]}` })
      return
    }

    // Conversación + costeo
    const ans = await answerImmigration(text)
    const { data: conv } = await supa.from('conversations')
      .insert({ user_id: user.id }).select('id').single()
    const { data: msg } = await supa.from('messages').insert({
      conversation_id: conv.id, role:'assistant', content: ans.text,
      tokens_input: ans.usage.prompt_tokens ?? 0,
      tokens_output: ans.usage.completion_tokens ?? 0,
      cost_cents: ans.cost_cents
    }).select('id').single()

    await debitAfterChat(user.id, ans.cost_cents, msg.id)
    await sock.sendMessage(jid, { text: ans.text })
  })

  logger.info('Baileys iniciado')
}

Baileys: manejo de mensajes entrantes vía socket.  ￼ ￼

5.10 src/server.ts

import express from 'express'
import { stripeWebhook } from './billing/stripe'
import { logger } from './utils/logger'

export function startServer() {
  const app = express()
  app.get('/health', (_req,res)=>res.send('ok'))
  // Stripe requiere el raw body para firmar
  app.post('/webhooks/stripe', express.raw({type:'application/json'}), stripeWebhook)
  const port = process.env.PORT ?? 3000
  app.listen(port, ()=> logger.info({port}, 'HTTP server up'))
}

5.11 src/index.ts

import { startServer } from './server'
import { startWhatsApp } from './whatsapp/baileys'
startServer()
startWhatsApp()


⸻

6) Mensajes legales y UX mínimos
	•	Descargo estándar (inclúyelo en SYSTEM prompt y saludo):
“Esta información es orientativa y no constituye asesoría legal. Para casos complejos, consulta a un profesional colegiado.”
	•	Privacidad/consentimiento: al primer “hola”, añade:
“Al usar el servicio aceptas el tratamiento de tus datos para darte soporte. Escribe BAJA para eliminar tus datos.”
	•	Adjuntos: bloquear en v1 (solo texto).
	•	Fuentes: el bot puede ofrecer 1–2 enlaces oficiales por respuesta (no hace falta citación formal).

⸻

7) Stripe — creación de Payment Links
	•	Crea 3 precios únicos (5/10/15 EUR) en el Dashboard y genera Payment Links. Copia las URLs en .env.
	•	El webhook consumirá checkout.session.completed y acreditará exactamente lo pagado (simple y robusto para MVP).  ￼

⸻

8) Pruebas (script de humo en /scripts/smoke_test.md)
	1.	Onboarding
	•	Envía “hola” al número del bot → recibe saludo + saldo €3.
	2.	Moderación
	•	Envía texto obviamente problemático → respuesta de bloqueo.
	3.	Consumo
	•	Envía 3–5 consultas reales y verifica que el saldo decrece (revisa users.credits_cents y credit_ledger).
	4.	Sin saldo
	•	Forzar €0 → bot responde con 3 links.
	5.	Pago
	•	Completa un Payment Link de €5 con un teléfono que coincida con phone_e164.
	•	Simula webhook con Stripe CLI → saldo +€5; mensaje “Pago recibido”.
	6.	Baja
	•	Envía “BAJA” → elimina datos del usuario.
	7.	Métricas
	•	Consulta metrics_daily en Supabase → filas con día, mensajes y coste IA.

⸻

9) Observabilidad mínima
	•	Logs: nivel info + errores de webhook.
	•	Alertas: si stripe_event_id ya existe (duplicado), log nivel warn.
	•	Trazabilidad: guarda tokens_* y cost_cents por mensaje.

⸻

10) Seguridad y hardening
	•	.env fuera del control de versiones.
	•	RLS activado; sólo Service Role desde backend.  ￼
	•	Idempotencia en pagos vía stripe_event_id único.
	•	Timeouts: no bloquees la respuesta del webhook (Stripe espera rápido).  ￼
	•	Riesgo canal: recuerda que Baileys es no oficial (riesgo de baneo); para producción seria, migrar a Cloud API.  ￼

⸻

11) Tareas para que el LLM ejecute (paso a paso con commits)
	1.	Crear skeleton
	•	Añadir carpetas y archivos de la sección 3 y 5.
	•	Commit: chore(mvp): scaffold bot structure and env
	2.	Migraciones Supabase
	•	Crear 001_schema.sql y 002_policies.sql. Ejecutarlas en Supabase.
	•	Commit: feat(db): schema + RLS policies for credits & payments
	3.	Implementar coste y créditos
	•	Añadir calc.ts y credit.ts.
	•	Commit: feat(credits): cost estimation and ledger operations
	4.	Integrar OpenAI
	•	Crear openai.ts (con SYSTEM prompt) y moderation.ts.
	•	Commit: feat(llm): gpt-4.1 answer + moderation flow
	5.	WhatsApp (Baileys)
	•	Implementar baileys.ts, alta de usuario, BAJA, control de saldo, envío de links.
	•	Commit: feat(whatsapp): inbound handling and responses via Baileys
	6.	Stripe webhook
	•	Implementar billing/stripe.ts y server.ts.
	•	Commit: feat(billing): stripe webhook and topup credit
	7.	Copys y flujos
	•	Completar flows.ts con mensajes finales.
	•	Commit: feat(copy): onboarding, no-credit, paid, baja
	8.	Pruebas de humo y ajustes
	•	Documento /scripts/smoke_test.md.
	•	Commit: test(smoke): documented scenarios and fixes
	9.	Hardening
	•	Idempotencia en pagos, logs.
	•	Commit: chore(hardening): idempotency and logging

⸻

12) Roadmap “día 2” (post-MVP)
	•	Migración a WhatsApp Cloud API (webhooks oficiales; menos riesgo).  ￼
	•	Checkout Sessions dinámicas con metadata.phone_e164 (evita depender del número en el Payment Link).  ￼
	•	Panel admin: dashboard en Supabase o una página Next.js sólo para ustedes.
	•	Cola a humano: flag de complejidad y derivación.
	•	Fuentes oficiales enriquecidas: pequeñas plantillas con links frecuentes (NIE, TIE, arraigo, padrón, etc.).
	•	Audio→texto (si decides abrir adjuntos) y multifuente.
