import OpenAI from 'openai'
import { logger } from '../utils/logger'

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
})

export interface ModerationResult {
  flagged: boolean
  categories: string[]
  category_scores: any
}

export async function moderateContent(text: string): Promise<ModerationResult | null> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured, skipping moderation')
      return null
    }

    const response = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text
    })

    const result = response.results[0]
    if (!result) {
      logger.warn('No moderation result received')
      return null
    }

    return {
      flagged: result.flagged,
      categories: Object.keys(result.categories).filter(cat => result.categories[cat as keyof typeof result.categories]),
      category_scores: result.category_scores
    }

  } catch (error) {
    logger.error({ error }, 'Error during content moderation')
    return null
  }
}

export async function isContentAppropriate(text: string): Promise<boolean> {
  const result = await moderateContent(text)
  
  // If moderation fails, allow content (fail open for availability)
  if (!result) {
    return true
  }
  
  return !result.flagged
}