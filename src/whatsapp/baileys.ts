import makeWASocket, { 
  useMultiFileAuthState, 
  ConnectionState, 
  WAMessage,
  proto,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import * as qrcode from 'qrcode-terminal'
import { logger } from '../utils/logger'
import { ensureUser, hasCredits, canAfford, getUserCredits, debitCredits, deleteUserData, getTopupLinks, isFirstInteraction, clearFirstInteraction, hasMessagesRemaining, incrementMessageCount, getUserMessageCount, USE_CREDIT_SYSTEM } from '../domain/credit'
import { askImmigrationQuestion, ConversationMessage } from '../llm/openai'
import { isContentAppropriate } from '../llm/moderation'
import { MESSAGES, COMMANDS } from '../domain/flows'
import { addUserMessage, addAssistantMessage, getConversationMessages, clearConversation } from '../domain/conversation'

export class WhatsAppBot {
  private socket: ReturnType<typeof makeWASocket> | null = null
  private isConnecting = false
  
  // Authorized phone numbers that can use the bot
  private readonly authorizedNumbers = ['+34686468168', '+5215555042401', '+34603114264']

  async start(): Promise<void> {
    if (this.isConnecting) {
      logger.info('WhatsApp connection already in progress')
      return
    }

    this.isConnecting = true

    try {
      const authDir = process.env.BAILEYS_STATE_DIR || 'auth'
      const { state, saveCreds } = await useMultiFileAuthState(authDir)
      const { version } = await fetchLatestBaileysVersion()

      logger.info({ version, authDir }, 'Starting WhatsApp connection')

      this.socket = makeWASocket({
        version,
        auth: state,
        logger: logger.child({ module: 'baileys' }),
        browser: ['Reco Extranjería', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false
      })

      // Handle credentials updates
      this.socket.ev.on('creds.update', saveCreds)

      // Handle connection updates
      this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this))

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', this.handleMessages.bind(this))

      logger.info('WhatsApp bot started successfully')

    } catch (error) {
      logger.error({ error }, 'Failed to start WhatsApp bot')
      this.isConnecting = false
      throw error
    }
  }

  private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      logger.info('QR Code generated - scan with WhatsApp to connect')
      console.log('\n📱 WhatsApp QR Code:')
      console.log('⬇️ Scan this QR code with your WhatsApp mobile app\n')
      qrcode.generate(qr, { small: true })
      console.log('\n💡 After scanning, you can send messages to test the bot!')
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      
      logger.info({ 
        shouldReconnect, 
        statusCode: (lastDisconnect?.error as Boom)?.output?.statusCode 
      }, 'WhatsApp connection closed')

      if (shouldReconnect) {
        logger.info('Attempting to reconnect to WhatsApp...')
        this.isConnecting = false
        setTimeout(() => this.start(), 3000)
      } else {
        logger.warn('WhatsApp logged out - manual re-authentication required')
        this.isConnecting = false
      }
    } else if (connection === 'open') {
      logger.info('WhatsApp connection established successfully')
      this.isConnecting = false
    }
  }

  private async handleMessages(msgUpdate: { messages: WAMessage[], type: 'notify' | 'append' }): Promise<void> {
    const { messages } = msgUpdate

    for (const message of messages) {
      try {
        await this.processMessage(message)
      } catch (error) {
        logger.error({ error, messageKey: message.key }, 'Error processing message')
      }
    }
  }

  private async processMessage(message: WAMessage): Promise<void> {
    // Skip if no message content or if it's from us
    if (!message.message || message.key.fromMe) {
      return
    }

    // Extract phone number and check authorization FIRST
    const phoneE164 = this.extractPhoneNumber(message.key.remoteJid!)
    
    if (!phoneE164) {
      logger.warn({ remoteJid: message.key.remoteJid }, 'Could not extract phone number')
      return
    }

    // Only respond to authorized phone numbers - check BEFORE any message sending
    if (!this.authorizedNumbers.includes(phoneE164)) {
      logger.info({ phoneE164 }, 'Ignoring message from unauthorized number')
      return
    }

    const messageType = Object.keys(message.message)[0]
    
    // Only process text messages for MVP
    if (messageType !== 'conversation' && messageType !== 'extendedTextMessage') {
      await this.sendMessage(
        message.key.remoteJid!,
        MESSAGES.onlyText()
      )
      return
    }

    const text = message.message.conversation || 
                 message.message.extendedTextMessage?.text || ''

    logger.info({ 
      phoneE164, 
      messageLength: text.length,
      messageType 
    }, 'Processing WhatsApp message')

    await this.handleUserMessage(phoneE164, text)
  }

  private async handleUserMessage(phoneE164: string, text: string): Promise<void> {
    // Authorization already checked in processMessage()
    
    const jid = phoneE164.replace('+', '') + '@s.whatsapp.net'
    
    // Get or create user
    const user = await ensureUser(phoneE164)
    if (!user) {
      logger.error({ phoneE164 }, 'Failed to ensure user')
      await this.sendMessage(jid, MESSAGES.error())
      return
    }
    const isNewUser = isFirstInteraction(phoneE164)

    // Handle BAJA command first
    if (COMMANDS.isBajaCommand(text)) {
      const deleted = await deleteUserData(user.id)
      if (deleted) {
        // Clear conversation history when user data is deleted
        clearConversation(phoneE164)
        await this.sendMessage(jid, MESSAGES.dataDeleted())
      } else {
        await this.sendMessage(jid, MESSAGES.error())
      }
      return
    }

    // Check if it's just a simple greeting
    const isSimpleGreeting = /^(hola|hi|hello|buenas|hey)$/i.test(text.trim())
    
    // Handle greetings and new users
    if (isSimpleGreeting) {
      // Always send welcome for greetings
      await this.sendMessage(jid, MESSAGES.welcome(isNewUser))
      // Clear first interaction flag after sending welcome
      if (isNewUser) {
        clearFirstInteraction(phoneE164)
      }
      return // Don't process greetings as questions
    } else if (isNewUser) {
      // For new users with real questions, send welcome but continue processing
      await this.sendMessage(jid, MESSAGES.welcome(true))
      // Clear first interaction flag after sending welcome
      clearFirstInteraction(phoneE164)
    }

    // Content moderation
    const isAppropriate = await isContentAppropriate(text)
    if (!isAppropriate) {
      await this.sendMessage(jid, MESSAGES.moderationWarning())
      return
    }

    // Check usage limits (credits vs message count based on feature flag)
    if (USE_CREDIT_SYSTEM) {
      // Future: credit-based system
      const userHasCredits = await hasCredits(user.id)
      if (!userHasCredits) {
        const links = getTopupLinks()
        await this.sendMessage(jid, MESSAGES.noCredits(links))
        return
      }
    } else {
      // Current: message limit system
      const userHasMessages = await hasMessagesRemaining(user.id)
      if (!userHasMessages) {
        await this.sendMessage(jid, MESSAGES.messageLimitReached())
        return
      }
    }

    // Add user message to conversation history
    addUserMessage(phoneE164, text)
    
    // Get conversation history for context
    const conversationHistory = getConversationMessages(phoneE164)
    
    // Convert to format expected by OpenAI (exclude the current message as we pass it separately)
    const historyForOpenAI: ConversationMessage[] = conversationHistory
      .slice(0, -1) // Remove the last message (current user message)
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    
    // Process immigration question with OpenAI
    await this.sendTyping(jid, true)
    
    try {
      const response = await askImmigrationQuestion(text, historyForOpenAI)
      
      // Add assistant response to conversation history
      addAssistantMessage(phoneE164, response.text)
      
      // Handle usage tracking (credits vs message count)
      let finalUsageInfo
      if (USE_CREDIT_SYSTEM) {
        // Future: debit credits based on actual usage
        await debitCredits(user.id, response.cost_cents)
        finalUsageInfo = await getUserCredits(user.id)
      } else {
        // Current: increment message count
        finalUsageInfo = await incrementMessageCount(user.id)
      }
      
      await this.sendMessage(jid, response.text)
      
      const logData: any = {
        phoneE164,
        model: process.env.OPENAI_MODEL,
        tokens: response.usage.total_tokens,
        inputTokens: response.usage.input_tokens,
        cachedTokens: response.usage.cached_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd: response.cost_details.cost_usd,
        costCents: response.cost_cents,
        searchCostCents: response.search_cost_cents,
        searchUsed: response.search_used,
        conversationLength: conversationHistory.length,
        useCreditSystem: USE_CREDIT_SYSTEM
      }

      if (USE_CREDIT_SYSTEM) {
        logData.finalCreditsUsdCents = finalUsageInfo
        logData.finalCreditsDisplayEur = (finalUsageInfo / 100).toFixed(2)
      } else {
        logData.messageCount = finalUsageInfo
        logData.messagesRemaining = 100 - finalUsageInfo
      }

      logger.info(logData, USE_CREDIT_SYSTEM ? 
        'Immigration question processed with credit tracking' : 
        'Immigration question processed with message count tracking'
      )

    } catch (error) {
      logger.error({ error, phoneE164 }, 'Error processing immigration question')
      await this.sendMessage(jid, MESSAGES.error())
    } finally {
      await this.sendTyping(jid, false)
    }
  }

  private extractPhoneNumber(remoteJid: string): string | null {
    // Format: 1234567890@s.whatsapp.net -> +1234567890
    const match = remoteJid.match(/^(\d+)@s\.whatsapp\.net$/)
    if (match) {
      return '+' + match[1]
    }
    return null
  }

  private async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.socket) {
      logger.error('Cannot send message: WhatsApp socket not connected')
      return
    }

    try {
      await this.socket.sendMessage(jid, { text })
      logger.info({ jid, textLength: text.length }, 'Message sent successfully')
    } catch (error) {
      logger.error({ error, jid }, 'Failed to send message')
    }
  }

  private async sendTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.socket) return

    try {
      await this.socket.sendPresenceUpdate(isTyping ? 'composing' : 'available', jid)
    } catch (error) {
      logger.error({ error, jid }, 'Failed to send typing indicator')
    }
  }

  async stop(): Promise<void> {
    if (this.socket) {
      logger.info('Stopping WhatsApp bot...')
      this.socket.end(undefined)
      this.socket = null
    }
  }
}

export async function startWhatsAppBot(): Promise<WhatsAppBot> {
  const bot = new WhatsAppBot()
  await bot.start()
  return bot
}