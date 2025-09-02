import { logger } from '../utils/logger'

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PerplexityResponse {
  id: string
  model: string
  created: number
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  choices: {
    index: number
    finish_reason: string
    message: {
      role: string
      content: string
    }
    delta?: {
      role?: string
      content?: string
    }
  }[]
}

export interface SearchResult {
  content: string
  sources: string[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class PerplexityClient {
  private apiKey: string
  private baseUrl: string = 'https://api.perplexity.ai'
  private model: string

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || ''
    this.model = process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online'
    
    if (!this.apiKey) {
      logger.warn('Perplexity API key not configured, search functionality disabled')
    }
  }

  async searchImmigrationInfo(
    query: string,
    focusSites?: string[],
    maxTokens: number = 500
  ): Promise<SearchResult | null> {
    try {
      if (!this.apiKey) {
        logger.warn('Perplexity search attempted without API key')
        return null
      }

      // Enhance query for Spanish immigration context
      const enhancedQuery = this.enhanceImmigrationQuery(query, focusSites)
      
      const messages: PerplexityMessage[] = [
        {
          role: 'system',
          content: `Eres un experto en inmigración española. Busca información actualizada y oficial sobre extranjería en España. 
          
Instrucciones:
- Prioriza fuentes oficiales del gobierno español
- Incluye fechas cuando sea relevante
- Responde en español claro y práctico
- Si encuentras cambios recientes en la legislación, mencionalo
- Incluye enlaces a fuentes oficiales cuando sea posible`
        },
        {
          role: 'user',
          content: enhancedQuery
        }
      ]

      logger.info({ 
        query: enhancedQuery, 
        model: this.model,
        maxTokens 
      }, 'Making Perplexity search request')

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.1, // Low temperature for factual accuracy
          top_p: 0.9,
          search_domain_filter: focusSites || this.getDefaultSpanishSites(),
          return_images: false,
          return_related_questions: false,
          stream: false
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error({ 
          status: response.status, 
          error: errorText 
        }, 'Perplexity API error')
        return null
      }

      const data = await response.json() as PerplexityResponse
      
      if (!data.choices?.[0]?.message?.content) {
        logger.error('No content in Perplexity response')
        return null
      }

      const content = data.choices[0].message.content
      const sources = this.extractSources(content)

      logger.info({ 
        tokens: data.usage?.total_tokens || 0,
        sourcesFound: sources.length 
      }, 'Perplexity search completed')

      return {
        content,
        sources,
        usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      }

    } catch (error) {
      logger.error({ error, query }, 'Perplexity search failed')
      return null
    }
  }

  private enhanceImmigrationQuery(query: string, focusSites?: string[]): string {
    // Add Spanish immigration context
    let enhanced = `Información actualizada sobre inmigración en España: ${query}`
    
    // Add site focus if specified
    if (focusSites?.length) {
      enhanced += ` (buscar en: ${focusSites.join(', ')})`
    }
    
    // Add temporal context for current information
    const currentYear = new Date().getFullYear()
    enhanced += ` - información vigente en ${currentYear}`
    
    return enhanced
  }

  private getDefaultSpanishSites(): string[] {
    return [
      'extranjeria.mitramiss.gob.es',
      'sede.administracion.gob.es',
      'boe.es',
      'sepe.es',
      'interior.gob.es',
      'inclusion.gob.es',
      'inem.es'
    ]
  }

  private extractSources(content: string): string[] {
    const sources: string[] = []
    
    // Extract URLs from markdown links [text](url)
    const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []
    for (const link of markdownLinks) {
      const urlMatch = link.match(/\]\(([^)]+)\)/)
      if (urlMatch?.[1]) {
        sources.push(urlMatch[1])
      }
    }
    
    // Extract plain URLs
    const urlRegex = /https?:\/\/[^\s\)]+/g
    const urls = content.match(urlRegex) || []
    sources.push(...urls)
    
    // Remove duplicates and invalid URLs
    return [...new Set(sources)]
      .filter(url => {
        try {
          new URL(url)
          return true
        } catch {
          return false
        }
      })
      .slice(0, 5) // Limit to 5 sources max
  }

  isSearchEnabled(): boolean {
    return Boolean(this.apiKey && process.env.SEARCH_ENABLED !== 'false')
  }

  estimateSearchCost(tokens: number): number {
    // Perplexity pricing: approximately $1 per 1M tokens
    // Convert to cents: $1 = 100 cents
    return Math.round((tokens / 1_000_000) * 100)
  }
}