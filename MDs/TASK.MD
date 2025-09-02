# TASK.MD - MVP "Reco Extranjería" Implementation Tasks

## 🎯 Objetivo
Implementar un chatbot de WhatsApp para consultas de inmigración con sistema de créditos y pagos.

---

## ✅ Tareas Principales

### 1. Configuración Inicial del Proyecto ✅
- [x] Crear estructura de carpetas según especificación
- [x] Configurar TypeScript (`tsconfig.json`)
- [x] Instalar dependencias NPM
- [x] Crear archivo `.env` con variables de entorno (creado `.env.example`)
- [x] Configurar `.gitignore` para excluir `.env` y `auth/`

### 2. Base de Datos (Supabase) ⏳
- [ ] Crear proyecto en Supabase
- [x] Ejecutar migración `001_schema.sql` (tablas y vistas) - archivo creado
- [x] Ejecutar migración `002_policies.sql` (RLS) - archivo creado
- [ ] Obtener y configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
- [x] Verificar conexión desde el código - código preparado

### 3. Sistema de Créditos
- [ ] Implementar `src/domain/calc.ts` (cálculo de costos)
- [ ] Implementar `src/domain/credit.ts` (gestión de créditos)
- [ ] Crear función `ensureUser()` para alta automática
- [ ] Implementar débito después de cada consulta
- [ ] Añadir ledger de transacciones

### 4. Integración OpenAI
- [ ] Configurar cliente OpenAI con API key
- [ ] Implementar `src/llm/openai.ts` con prompt del sistema
- [ ] Implementar `src/llm/moderation.ts` para filtrado
- [ ] Configurar cálculo de tokens y costos
- [ ] Probar respuestas con consultas de ejemplo

### 5. WhatsApp con Baileys
- [ ] Implementar `src/whatsapp/baileys.ts`
- [ ] Configurar autenticación multi-dispositivo
- [ ] Implementar manejo de mensajes entrantes
- [ ] Añadir comando "BAJA" para eliminación de datos
- [ ] Implementar envío de links de recarga cuando saldo = 0
- [ ] Generar y escanear código QR inicial

### 6. Integración Stripe
- [ ] Crear cuenta Stripe (si no existe)
- [ ] Crear 3 Payment Links (€5, €10, €15)
- [ ] Implementar `src/billing/stripe.ts`
- [ ] Configurar webhook endpoint `/webhooks/stripe`
- [ ] Implementar manejo de `checkout.session.completed`
- [ ] Configurar `STRIPE_WEBHOOK_SECRET`

### 7. Servidor Express ✅
- [x] Implementar `src/server.ts`
- [x] Configurar endpoint `/health`
- [x] Configurar endpoint `/webhooks/stripe` con raw body (placeholder)
- [x] Implementar `src/index.ts` como punto de entrada
- [ ] Probar servidor localmente

### 8. Mensajes y Flujos
- [ ] Implementar `src/domain/flows.ts` con copys
- [ ] Mensaje de bienvenida con crédito inicial
- [ ] Mensaje de sin saldo con links de pago
- [ ] Mensaje de confirmación de pago
- [ ] Mensaje de baja confirmada

### 9. Utilidades ✅
- [x] Implementar `src/utils/logger.ts` con Pino
- [x] Configurar niveles de log
- [x] Añadir logs en puntos críticos

### 10. Testing y Validación
- [ ] Crear `scripts/smoke_test.md` con casos de prueba
- [ ] Probar flujo de onboarding (primer "hola")
- [ ] Probar moderación con contenido problemático
- [ ] Probar consumo de créditos
- [ ] Probar recarga vía Payment Link
- [ ] Probar comando "BAJA"
- [ ] Verificar métricas en vista `metrics_daily`

---

## 🔧 Configuración de Stripe

### Payment Links a crear:
1. **€5** - Link básico
2. **€10** - Link medio  
3. **€15** - Link premium

### Configuración del webhook:
- Endpoint: `https://tu-dominio.com/webhooks/stripe`
- Eventos a escuchar: `checkout.session.completed`
- Obtener signing secret para `STRIPE_WEBHOOK_SECRET`

---

## 🚀 Orden de Ejecución Recomendado

1. **Fase 1 - Infraestructura** ✅
   - Configuración inicial ✅
   - Base de datos (parcial - falta crear proyecto Supabase)
   - Servidor Express ✅

2. **Fase 2 - Core**
   - Sistema de créditos
   - Integración OpenAI
   - Cálculo de costos

3. **Fase 3 - Canales**
   - WhatsApp/Baileys
   - Stripe webhooks

4. **Fase 4 - Testing**
   - Pruebas de humo
   - Validación end-to-end

---

## 📝 Commits Sugeridos

```bash
# Estructura inicial
git commit -m "chore(mvp): scaffold bot structure and env"

# Base de datos
git commit -m "feat(db): schema + RLS policies for credits & payments"

# Sistema de créditos
git commit -m "feat(credits): cost estimation and ledger operations"

# OpenAI
git commit -m "feat(llm): gpt-4.1 answer + moderation flow"

# WhatsApp
git commit -m "feat(whatsapp): inbound handling and responses via Baileys"

# Pagos
git commit -m "feat(billing): stripe webhook and topup credit"

# Mensajes
git commit -m "feat(copy): onboarding, no-credit, paid, baja"

# Testing
git commit -m "test(smoke): documented scenarios and fixes"

# Hardening
git commit -m "chore(hardening): idempotency and logging"
```

---

## 🔒 Checklist de Seguridad

- [x] `.env` excluido de git
- [x] RLS activado en todas las tablas (en migraciones)
- [x] Service Role Key solo en backend (configurado en supabase.ts)
- [ ] Validación de webhook signature de Stripe
- [ ] Idempotencia en procesamiento de pagos
- [ ] Moderación activa de contenido
- [x] Logs sin información sensible

---

## 📊 Métricas MVP

### KPIs a validar:
- Alta automática funcional
- Regalo de €3 iniciales
- Débito correcto por tokens usados
- Bloqueo al llegar a €0
- Recarga exitosa vía Payment Link
- Re-acreditación por webhook

### Consultas útiles:
```sql
-- Usuarios nuevos por día
SELECT date_trunc('day', created_at), count(*) 
FROM users 
GROUP BY 1 ORDER BY 1 DESC;

-- Consumo promedio por usuario
SELECT avg(cost_cents) 
FROM messages 
WHERE role = 'assistant';

-- Recargas exitosas
SELECT count(*), sum(amount_cents)/100 as total_eur 
FROM payments 
WHERE status = 'succeeded';
```

---

## 🚨 Riesgos Conocidos

1. **Baileys no oficial** - Riesgo de baneo de WhatsApp
2. **Reconciliación por teléfono** - Payment Links no tienen metadata dinámica en MVP
3. **Cambio USD→EUR** - Tasa fija en `.env`, actualizar manualmente

---

## 📅 Post-MVP (Día 2)

- [ ] Migrar a WhatsApp Cloud API oficial
- [ ] Checkout Sessions dinámicas con metadata
- [ ] Panel de administración
- [ ] Derivación a humano para casos complejos
- [ ] Soporte de audio (transcripción)
- [ ] Templates de respuestas frecuentes

---

## 🔍 Notas de Implementación

- **Modelo GPT**: `gpt-4.1` configurado en `.env`
- **Moderación**: `omni-moderation-latest`
- **Concurrencia**: Procesar mensajes secuencialmente
- **Timeout webhook**: Responder a Stripe en <10s
- **Crédito inicial**: €3 (300 céntimos)
- **Formato teléfono**: E.164 (+34600111222)

---

## ✏️ Variables de Entorno Requeridas

```env
# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1

# Costeo
PRICE_INPUT_PER_MTOK_USD=3.0
PRICE_OUTPUT_PER_MTOK_USD=12.0
USD_EUR_RATE=0.92
COST_MULTIPLIER=1.15

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_LINK_5_EUR=
STRIPE_LINK_10_EUR=
STRIPE_LINK_15_EUR=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# WhatsApp/Baileys
BAILEYS_STATE_DIR=auth
BOT_NAME="Reco Extranjería"
BOT_INIT_CREDITS_CENTS=300
```