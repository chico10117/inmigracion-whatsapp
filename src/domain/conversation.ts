import { logger } from '../utils/logger'

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
}

export function clearConversation(phoneE164: string): void {
  conversations.delete(phoneE164)
  logger.info({ phoneE164 }, 'Cleared conversation history')
}

export function getConversationMessages(phoneE164: string): Message[] {
  const conversation = getConversation(phoneE164)
  return conversation ? conversation.messages : []
}