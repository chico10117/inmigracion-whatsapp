import { PerplexityClient, SearchResult } from './perplexity'
import { logger } from '../utils/logger'

export interface SearchFunctionCall {
  name: string
  arguments: {
    query: string
    focus_sites?: string[]
    search_reason?: string
  }
}

export interface SearchHandlerResult {
  success: boolean
  content: string
  sources: string[]
  tokens_used: number
  cost_cents: number
  cached: boolean
}

export class SearchHandler {
  private perplexity: PerplexityClient
  private cache: Map<string, { result: SearchResult, timestamp: number }>
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

  constructor() {
    this.perplexity = new PerplexityClient()
    this.cache = new Map()
  }

  async handleSearchFunction(functionCall: SearchFunctionCall): Promise<SearchHandlerResult> {
    try {
      const { query, focus_sites, search_reason } = functionCall.arguments
      
      logger.info({ 
        query, 
        focus_sites, 
        search_reason 
      }, 'Handling search function call')

      // Check if search is enabled
      if (!this.perplexity.isSearchEnabled()) {
        logger.warn('Search requested but not enabled')
        return {
          success: false,
          content: 'La búsqueda de información actual no está disponible en este momento. Responderé basándome en mi conocimiento general.',
          sources: [],
          tokens_used: 0,
          cost_cents: 0,
          cached: false
        }
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(query, focus_sites)
      const cachedResult = this.getFromCache(cacheKey)
      
      if (cachedResult) {
        logger.info('Returning cached search result')
        return {
          success: true,
          content: cachedResult.content,
          sources: cachedResult.sources,
          tokens_used: 0, // No API call made
          cost_cents: 0,
          cached: true
        }
      }

      // Perform search
      const searchResult = await this.perplexity.searchImmigrationInfo(
        query,
        focus_sites,
        500 // Max tokens for search response
      )

      if (!searchResult) {
        logger.warn('Search failed, returning fallback message')
        return {
          success: false,
          content: 'No pude obtener información actualizada en este momento. Te ayudo con mi conocimiento general sobre el tema.',
          sources: [],
          tokens_used: 0,
          cost_cents: 0,
          cached: false
        }
      }

      // Cache the result
      this.cache.set(cacheKey, {
        result: searchResult,
        timestamp: Date.now()
      })

      // Calculate cost
      const costCents = this.perplexity.estimateSearchCost(searchResult.usage.total_tokens)

      logger.info({ 
        tokens: searchResult.usage.total_tokens,
        sources: searchResult.sources.length,
        costCents
      }, 'Search completed successfully')

      return {
        success: true,
        content: this.formatSearchResult(searchResult),
        sources: searchResult.sources,
        tokens_used: searchResult.usage.total_tokens,
        cost_cents: costCents,
        cached: false
      }

    } catch (error) {
      logger.error({ error, functionCall }, 'Search handler error')
      return {
        success: false,
        content: 'Hubo un error al buscar información actualizada. Responderé con mi conocimiento general.',
        sources: [],
        tokens_used: 0,
        cost_cents: 0,
        cached: false
      }
    }
  }

  private generateCacheKey(query: string, focusSites?: string[]): string {
    const sitesKey = focusSites?.sort().join(',') || 'default'
    return `${query.toLowerCase().trim()}-${sitesKey}`
  }

  private getFromCache(key: string): SearchResult | null {
    const cached = this.cache.get(key)
    
    if (!cached) {
      return null
    }

    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return cached.result
  }

  private formatSearchResult(result: SearchResult): string {
    let formatted = result.content

    // Add sources if available
    if (result.sources.length > 0) {
      formatted += '\n\n📚 **Fuentes consultadas:**'
      result.sources.forEach((source, index) => {
        formatted += `\n${index + 1}. ${source}`
      })
    }

    // Add freshness indicator
    formatted += '\n\n🔄 *Información actualizada consultada en tiempo real*'

    return formatted
  }

  // Clean expired cache entries
  cleanCache(): void {
    const now = Date.now()
    const expired: string[] = []

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        expired.push(key)
      }
    }

    expired.forEach(key => this.cache.delete(key))
    
    if (expired.length > 0) {
      logger.info({ expiredEntries: expired.length }, 'Cleaned expired cache entries')
    }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// Export search function definition for OpenAI Chat Completions API
export const SEARCH_FUNCTION_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'search_current_immigration_info',
    description: 'Busca información actualizada sobre inmigración española de forma proactiva cuando exista cualquier posibilidad de cambios recientes, variaciones por provincia o detalles sensibles a la fecha. Úsalo con frecuencia: cambios en leyes, nuevos requisitos/tasas/documentos, tiempos de procesamiento y citas, modelos y formularios oficiales, y cuando el usuario mencione años (2023+), "cambios", "nuevo" o "actualizado".',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La consulta específica sobre inmigración que necesita información actualizada. Ejemplo: "nuevos requisitos renovación NIE 2024", "cambios arraigo social", "tiempos procesamiento Madrid"'
        },
        focus_sites: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sitios específicos donde buscar (opcional). Por defecto busca en fuentes oficiales españolas.'
        },
        search_reason: {
          type: 'string',
          description: 'Breve explicación de por qué se necesita buscar información actual (p. ej. posible cambio reciente, variación provincial, referencia a año)'
        }
      },
      required: ['query']
    }
  }
}