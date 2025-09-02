import 'dotenv/config'
import { startServer } from './server'
import { startWhatsAppBot } from './whatsapp/baileys'
import { logger } from './utils/logger'

let whatsappBot: any = null

async function main() {
  try {
    logger.info('Starting Reco Extranjería bot...')
    
    // Start HTTP server for webhooks
    startServer()
    
    // Start WhatsApp bot
    logger.info('Initializing WhatsApp connection...')
    whatsappBot = await startWhatsAppBot()
    
    logger.info('🚀 Reco Extranjería bot is fully operational!')
    logger.info('📱 Scan the QR code with WhatsApp to start receiving messages')
    
  } catch (error) {
    logger.error({ error }, 'Failed to start bot')
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...')
  if (whatsappBot) {
    await whatsappBot.stop()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...')
  if (whatsappBot) {
    await whatsappBot.stop()
  }
  process.exit(0)
})

main()