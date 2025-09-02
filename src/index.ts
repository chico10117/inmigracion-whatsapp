import 'dotenv/config'
import { startServer } from './server'
import { logger } from './utils/logger'

async function main() {
  try {
    logger.info('Starting Reco Extranjería bot...')
    
    // Start HTTP server for webhooks
    startServer()
    
    // WhatsApp connection will be added here later
    logger.info('Bot infrastructure ready. WhatsApp connection pending implementation.')
    
  } catch (error) {
    logger.error({ error }, 'Failed to start bot')
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

main()