# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WhatsApp chatbot for immigration consultations in Spain ("Reco Extranjería"). The bot provides informational guidance about immigration processes with a credit-based payment system. It uses:
- **WhatsApp Web API** (@whiskeysockets/baileys) for messaging
- **OpenAI GPT-4.1** for natural language processing and responses
- **Perplexity API** for real-time web search of current immigration information
- **Supabase** (PostgreSQL) for user data, credits, and conversation history
- **Stripe Payment Links** for credit top-ups (€5/€10/€15)
- **TypeScript** with Node.js for type-safe backend development

## Key Architecture Components

### Core Files
- **src/index.ts**: Main entry point - initializes server and WhatsApp connection
- **src/server.ts**: Express server for health checks and Stripe webhooks
- **src/whatsapp/baileys.ts**: WhatsApp message handling and bot logic with conversation context
- **src/llm/openai.ts**: OpenAI GPT-4.1 integration with function calling for search and conversation history
- **src/llm/perplexity.ts**: Perplexity API client for real-time web search
- **src/llm/search-handler.ts**: Search function handler with caching system
- **src/llm/moderation.ts**: Content moderation using OpenAI's moderation API
- **src/billing/stripe.ts**: Stripe webhook handler for payment processing
- **src/domain/conversation.ts**: Conversation history management with 30-minute timeout
- **src/domain/credit.ts**: Credit management and user balance operations with first interaction tracking
- **src/domain/calc.ts**: Token cost calculation (USD to EUR conversion)
- **src/domain/flows.ts**: Message templates and user-facing copy
- **src/db/supabase.ts**: Database client configuration

### Directories
- **src/**: TypeScript source code
- **migrations/**: SQL migration files for Supabase
- **auth/**: WhatsApp session storage (auto-generated, gitignored)
- **dist/**: Compiled JavaScript output (gitignored)

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (with auto-reload)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run production build
npm start

# Type checking
npm run typecheck

# Clean build directory
npm run clean

# Run tests
npm run test:openai       # Test OpenAI integration
npm run test:whatsapp     # Test WhatsApp components
npm run test:search       # Test search integration
npm run test:web-search   # Comprehensive web search test
```

## Environment Variables

Create a `.env` file with (see `.env.example` for full template):
```
# OpenAI
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1

# Perplexity (for real-time search)
PERPLEXITY_API_KEY=your_perplexity_key_here
PERPLEXITY_MODEL=llama-3.1-sonar-small-128k-online
SEARCH_ENABLED=true

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
STRIPE_LINK_5_EUR=https://buy.stripe.com/your_5eur_link
STRIPE_LINK_10_EUR=https://buy.stripe.com/your_10eur_link
STRIPE_LINK_15_EUR=https://buy.stripe.com/your_15eur_link

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Bot Config
BOT_INIT_CREDITS_CENTS=300  # €3 initial credit
```

## Important Implementation Details

### Message Processing Flow
1. User sends message via WhatsApp
2. Bot checks/creates user with €3 initial credit (first time only)
3. **Message added to conversation history** (up to 20 messages, 30-minute timeout)
4. Content moderation check - blocks inappropriate content
5. Credit check - sends payment links if balance is 0
6. **Full conversation context** sent to GPT-4.1 with system prompt
7. **AI decides if web search is needed** (for current info, law changes, processing times)
8. If search needed: Perplexity API searches Spanish government sources
9. Combined response using both static knowledge, real-time information, and conversation context
10. **Assistant response added to conversation history**
11. Total cost calculated (OpenAI + search) and debited from user credits
12. Response sent back to user via WhatsApp with sources when applicable

### Credit System
- New users receive €3 initial credit (300 cents)
- Cost calculated based on actual GPT-4.1 token usage + search API calls
- USD to EUR conversion with configurable exchange rate
- 15% margin added for infrastructure costs
- **Search cost**: ~€0.01 per query (Perplexity API very affordable)
- Users can top up via Stripe Payment Links (€5/€10/€15)

### WhatsApp Integration
- Uses Baileys library for WhatsApp Web connection (unofficial)
- QR code authentication required on first run
- Session persisted in `auth/` directory
- Supports text messages only in v1
- **Conversation Context**: Maintains chat history for natural follow-up questions
- "BAJA" command for GDPR-compliant data deletion (clears conversation history)

### Conversation Management
- **Context Retention**: Maintains up to 20 messages per conversation
- **Auto-Timeout**: Conversations reset after 30 minutes of inactivity
- **Follow-up Questions**: Users can ask clarifying questions without repeating context
- **Memory Management**: Automatic pruning to prevent token overflow
- **Privacy Compliant**: History cleared on "BAJA" command or timeout

### Real-Time Web Search
- **Intelligent Search Decisions**: AI automatically determines when current information is needed
- **Spanish Government Focus**: Prioritizes official sources (extranjeria.mitramiss.gob.es, boe.es, etc.)
- **24-Hour Caching**: Avoids repeat API calls for same queries (cost optimization)
- **Source Attribution**: Includes official links in responses for verification
- **Graceful Fallback**: Works without search API (static knowledge only)

### Database Schema
- **users**: Phone number, credits, language preference
- **conversations**: Links messages to users
- **messages**: Stores chat history with token counts + search usage
- **payments**: Stripe payment records
- **credit_ledger**: Transaction history for audit trail (includes search costs)
- **metrics_daily**: Aggregated view for analytics

## Code Conventions

- Use TypeScript with strict mode enabled
- Maintain async/await pattern for asynchronous operations
- Keep Spanish language for all user-facing messages
- Provide clear, practical immigration guidance (not legal advice)
- Always handle errors gracefully with try/catch blocks
- Log important events using Pino logger
- Follow GDPR compliance for data handling

## Legal Disclaimer

This bot provides informational guidance only and does not constitute legal advice. Users are advised to consult qualified legal professionals for complex cases. The system includes:
- Clear disclaimer in welcome message
- "BAJA" command for immediate data deletion
- Transparent credit system with upfront pricing
- Secure payment processing via Stripe

## Security Considerations

- Never commit `.env` file to version control
- Use Supabase service role key only on backend
- Enable Row Level Security (RLS) on all tables
- Validate Stripe webhook signatures
- Implement idempotency for payment processing
- Store sensitive data only in environment variables

## Deployment Notes

- Baileys uses unofficial WhatsApp Web API (risk of ban)
- Plan migration to official WhatsApp Cloud API for production
- Monitor daily metrics via Supabase dashboard
- Keep USD/EUR exchange rate updated in `.env`
- Test payment flow with Stripe test mode first