import { logger } from '../utils/logger'
import { supa } from '../db/supabase'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface Conversation {
  phoneE164: string
  messages: Message[]
  lastActivity: Date
}

// In-memory conversation storage
const conversations = new Map<string, Conversation>()

// Max messages to keep in context (to avoid token limits)
const MAX_CONTEXT_MESSAGES = 20

// Conversation timeout (30 minutes)
const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000

export function getConversation(phoneE164: string): Conversation | null {
  const conversation = conversations.get(phoneE164)
  
  if (!conversation) {
    return null
  }
  
  // Check if conversation has timed out
  const timeSinceLastActivity = Date.now() - conversation.lastActivity.getTime()
  if (timeSinceLastActivity > CONVERSATION_TIMEOUT_MS) {
    logger.info({ phoneE164, timeSinceLastActivity }, 'Conversation timed out, starting fresh')
    conversations.delete(phoneE164)
    return null
  }
  
  return conversation
}

export function addUserMessage(phoneE164: string, content: string): Conversation {
  let conversation = getConversation(phoneE164)
  
  if (!conversation) {
    conversation = {
      phoneE164,
      messages: [],
      lastActivity: new Date()
    }
    conversations.set(phoneE164, conversation)
  }
  
  // Add user message
  conversation.messages.push({
    role: 'user',
    content,
    timestamp: new Date()
  })
  
  // Keep only the last MAX_CONTEXT_MESSAGES
  if (conversation.messages.length > MAX_CONTEXT_MESSAGES) {
    conversation.messages = conversation.messages.slice(-MAX_CONTEXT_MESSAGES)
  }
  
  conversation.lastActivity = new Date()
  
  logger.info({ 
    phoneE164, 
    messageCount: conversation.messages.length 
  }, 'Added user message to conversation')
  
  // Persist to DB asynchronously if configured
  void persistMessage(phoneE164, 'user', content)
  
  return conversation
}

export function addAssistantMessage(phoneE164: string, content: string): void {
  const conversation = conversations.get(phoneE164)
  
  if (!conversation) {
    logger.warn({ phoneE164 }, 'Attempted to add assistant message to non-existent conversation')
    return
  }
  
  conversation.messages.push({
    role: 'assistant',
    content,
    timestamp: new Date()
  })
  
  // Keep only the last MAX_CONTEXT_MESSAGES
  if (conversation.messages.length > MAX_CONTEXT_MESSAGES) {
    conversation.messages = conversation.messages.slice(-MAX_CONTEXT_MESSAGES)
  }
  
  conversation.lastActivity = new Date()
  
  logger.info({ 
    phoneE164, 
    messageCount: conversation.messages.length 
  }, 'Added assistant message to conversation')

  // Persist to DB asynchronously if configured
  void persistMessage(phoneE164, 'assistant', content)
}

export function clearConversation(phoneE164: string): void {
  conversations.delete(phoneE164)
  logger.info({ phoneE164 }, 'Cleared conversation history')
}

export function getConversationMessages(phoneE164: string): Message[] {
  const conversation = getConversation(phoneE164)
  return conversation ? conversation.messages : []
}

async function persistMessage(phoneE164: string, role: 'user' | 'assistant', content: string): Promise<void> {
  try {
    if (!supa) return

    // Ensure a conversation row exists for this user
    const { data: user } = await supa
      .from('users')
      .select('id')
      .eq('phone_e164', phoneE164)
      .maybeSingle()

    if (!user) {
      // If user not found (e.g., supa misconfigured), skip
      return
    }

    // Find open conversation or create new
    const { data: existing } = await supa
      .from('conversations')
      .select('id, last_msg_at')
      .eq('user_id', user.id)
      .order('last_msg_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    let conversationId: string

    if (!existing) {
      const { data: created, error: convErr } = await supa
        .from('conversations')
        .insert({ user_id: user.id, started_at: nowIso, last_msg_at: nowIso })
        .select('id')
        .single()
      if (convErr || !created) return
      conversationId = created.id
    } else {
      conversationId = existing.id
      await supa
        .from('conversations')
        .update({ last_msg_at: nowIso })
        .eq('id', conversationId)
    }

    // Insert message
    await supa
      .from('messages')
      .insert({ conversation_id: conversationId, role, content })
  } catch (error) {
    logger.error({ error, phoneE164 }, 'Failed to persist conversation message')
  }
}