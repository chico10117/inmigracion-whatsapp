import express from 'express'
import { logger } from './utils/logger'

export function startServer() {
  const app = express()
  
  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })
  
  // Stripe webhook will be added here later
  // For now, just a placeholder endpoint
  app.post('/webhooks/stripe', 
    express.raw({ type: 'application/json' }), 
    async (req, res) => {
      logger.info('Stripe webhook received (not implemented yet)')
      res.json({ received: true })
    }
  )
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  
  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error')
    res.status(500).json({ error: 'Internal server error' })
  })
  
  const port = process.env.PORT ?? 3000
  
  app.listen(port, () => {
    logger.info({ port }, 'HTTP server started')
  })
  
  return app
}