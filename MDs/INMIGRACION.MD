Título: MVP “Reco Extranjería” — Chatbot de WhatsApp con créditos y recargas

Objetivo:
Construir un MVP de chatbot en WhatsApp para responder dudas de inmigración/extranjería en España. El bot otorga crédito inicial de €3 por número nuevo y, cuando se agota, ofrece recargas por €5/€10/€15 mediante Stripe Payment Links. El coste por interacción se descuenta según tokens reales de GPT-4.1.

Audiencia y lenguaje:
- Target: inmigrantes latinoamericanos en España.
- Idioma: solo español (v1).
- Tono: claro, práctico, empático; NO asesoría legal (descargo).

Canal y librería:
- WhatsApp vía Baileys (WhiskeySockets) para MVP (no oficial; riesgo de baneo aceptado).
- Migración futura a WhatsApp Cloud API (oficial).

Stack e integraciones:
- Runtime: Node.js/TypeScript (MVP).
- IA: OpenAI GPT-4.1 (chat completions).
- Moderación: OpenAI Moderation (bloquear contenido sensible).
- BD: Supabase (Postgres) para usuarios, créditos, mensajes y pagos.
- Pagos: Stripe Payment Links preconfigurados (€5/€10/€15) + webhook `checkout.session.completed`.

Flujo principal (MVP):
1) Usuario escribe “hola” → alta/identificación por teléfono E.164 (+34…).
2) Se otorgan €3 iniciales (una sola vez por número). Mensaje de bienvenida + descargo legal + “BAJA” para eliminar datos.
3) Al recibir cada mensaje:
   - Moderación. Si infringe, se pide reformular.
   - Verificación de saldo. Si saldo ≤ 0 → enviar 3 links de Stripe.
   - Si hay saldo → llamada a GPT-4.1 con prompt de sistema; respuesta breve con pasos y, cuando aplique, 1-2 enlaces oficiales (SEPE, Extranjería, BOE, etc.).
   - Registrar tokens y coste; debitar créditos (céntimos EUR).
4) Stripe webhook acredita el importe pagado y notifica al usuario en WhatsApp.
5) “BAJA”: borra los datos del usuario y confirma.

Reglas y límites v1:
- Solo texto (sin audios/imagenes).
- El uso se corta al llegar a €0.
- Cálculo de coste por tokens reales (input/output) con precios GPT-4.1; conversión USD→EUR y margen configurable.

Datos mínimos:
- users(id, phone_e164, credits_cents, created_at, is_blocked)
- conversations(id, user_id, started_at, last_msg_at)
- messages(id, conversation_id, role, content, tokens_in, tokens_out, cost_cents)
- payments(id, user_id, stripe_event_id, amount_cents, status)
- credit_ledger(id, user_id, delta_cents, reason, ref_id)

Métricas mínimas:
- Nuevos usuarios/día, nº de mensajes, coste IA total, recargas totales.

Legal/privacidad:
- Descargo: información orientativa; no sustituye asesoría legal.
- Consentimiento: uso de datos para prestar el servicio; comando “BAJA” para eliminación.
- Mensajes de copy:
  - Bienvenida: regalo €3 y descargo.
  - Sin saldo: tres enlaces de recarga.
  - Post-pago: confirmación de saldo.
  - Baja: confirmación de eliminación.

Suposiciones/alcance v1:
- Payment Links estáticos (sin metadatos), reconcilio por número telefónico.
- Panel admin opcional (puede posponerse); métricas via consultas en Supabase/logs.
- Referencias oficiales en respuestas cuando sea útil (1-2 enlaces).

Criterios de éxito MVP:
- Alta automática + €3 iniciales.
- Descuento por tokens, bloqueo al llegar a €0.
- Recarga efectiva por Payment Link y acreditación por webhook.
- Respuestas útiles, moderación básica operativa, y métricas mínimas disponibles.

Riesgos/decisiones:
- Baileys no oficial (riesgo de baneo); aceptado para MVP.
- Precios y cambio USD→EUR parametrizados en `.env`.

Prompt de sistema (borrador):
“Eres ‘Reco Extranjería’. Ayudas a inmigrantes en España con orientación clara y práctica. No ofreces asesoría legal; indica límites y sugiere contactar profesionales cuando proceda. Responde en español, en 4-8 líneas máximo, usando pasos accionables. Cuando aporte valor, añade 1-2 enlaces oficiales (SEPE, Ministerio, Extranjería, BOE). Evita conjeturas; si falta contexto, pide la información mínima.”