import OpenAI from 'openai'
import { calculateAccurateCost, UsageDetails } from '../domain/calc'
import { logger } from '../utils/logger'
import { SearchHandler, SEARCH_FUNCTION_DEFINITION, SearchHandlerResult } from './search-handler'

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
})

const IMMIGRATION_SYSTEM_PROMPT = `Eres "Reco Extranjería", un asistente especializado en información sobre inmigración y extranjería en España.

INSTRUCCIONES IMPORTANTES:
- Proporciona información orientativa únicamente, NO asesoría legal
- Responde en español claro y práctico
- Máximo 4-8 líneas por respuesta
- Incluye pasos accionables cuando sea posible
- Cuando sea útil, menciona 1-2 fuentes oficiales (SEPE, Ministerio del Interior, Extranjería, BOE)
- Si la consulta supera tu ámbito, recomienda contactar un profesional colegiado
- Si necesitas más información para dar una respuesta precisa, pide los detalles mínimos necesarios

BÚSQUEDA DE INFORMACIÓN ACTUAL:
- Usa la función search_current_immigration_info cuando necesites información muy reciente sobre:
  * Cambios en leyes o reglamentos (2024-2025)
  * Nuevos requisitos o procedimientos
  * Tiempos de procesamiento actuales
  * Formularios o documentos actualizados
- NO uses búsqueda para información básica y estable (conceptos generales, definiciones)
- Siempre explica brevemente por qué buscas información actualizada

DISCLAIMER: Siempre recuerda que esta información es orientativa y no constituye asesoría legal profesional.

Ejemplos de fuentes oficiales útiles:
- Sede Electrónica de Extranjería: https://sede.administracionespublicas.gob.es/
- SEPE: https://www.sepe.es/
- Ministerio del Interior: https://www.interior.gob.es/
- BOE: https://www.boe.es/

Responde de forma empática y práctica, considerando que muchos usuarios pueden estar en situaciones de estrés o incertidumbre.`

export interface OpenAIResponse {
  text: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    input_tokens: number
    cached_tokens: number
    output_tokens: number
  }
  cost_details: UsageDetails
  cost_cents: number
  search_used: boolean
  search_cost_cents: number
  sources: string[]
}

// Initialize search handler
const searchHandler = new SearchHandler()

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function askImmigrationQuestion(
  question: string, 
  conversationHistory: ConversationMessage[] = []
): Promise<OpenAIResponse> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4.1'
    
    logger.info({ 
      model, 
      questionLength: question.length,
      historyLength: conversationHistory.length 
    }, 'Processing immigration question')

    let searchResult: SearchHandlerResult | null = null
    let finalResponse = ''
    let totalSearchCost = 0
    let allSources: string[] = []

    // Build messages array with conversation history
    const messages: any[] = [
      { 
        role: 'system', 
        content: IMMIGRATION_SYSTEM_PROMPT 
      }
    ]
    
    // Add conversation history
    conversationHistory.forEach(msg => {
      messages.push({
        role: msg.role,
        content: msg.content
      })
    })
    
    // Add current question
    messages.push({ 
      role: 'user', 
      content: question 
    })

    // Temporary fallback to Chat Completions until Responses API access is confirmed
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: [SEARCH_FUNCTION_DEFINITION],
      tool_choice: 'auto',
      max_tokens: 500,
      temperature: 0.7
    })

    const message = response.choices[0]?.message
    if (!message) {
      throw new Error('No response message received from OpenAI')
    }

    // Check if AI wants to use search function
    if (message.tool_calls?.length) {
      logger.info('AI requested search function')
      
      const searchCall = message.tool_calls[0]
      if (searchCall.function?.name === 'search_current_immigration_info') {
        try {
          const functionArgs = JSON.parse(searchCall.function.arguments)
          searchResult = await searchHandler.handleSearchFunction({
            name: searchCall.function.name,
            arguments: functionArgs
          })
          
          totalSearchCost = searchResult.cost_cents
          allSources = searchResult.sources
          
          // Continue conversation with search results - fall back to Chat Completions for tool follow-up
          const followUpResponse = await client.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: IMMIGRATION_SYSTEM_PROMPT },
              { role: 'user', content: question },
              { role: 'assistant', content: null, tool_calls: message.tool_calls },
              { 
                role: 'tool', 
                tool_call_id: searchCall.id,
                content: searchResult.content
              }
            ],
            max_tokens: 500,
            temperature: 0.7
          })
          
          finalResponse = followUpResponse.choices[0]?.message?.content || ''
          
          // Add search usage to total - Chat Completions API
          const followUpUsage = followUpResponse.usage || { 
            prompt_tokens: 0, 
            completion_tokens: 0, 
            total_tokens: 0
          }
          
          // Get initial usage from Chat Completions API  
          const initialUsage = response.usage || { 
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
          
          // Aggregate usage from both API calls
          response.usage = {
            prompt_tokens: initialUsage.prompt_tokens + followUpUsage.prompt_tokens,
            completion_tokens: initialUsage.completion_tokens + followUpUsage.completion_tokens,
            total_tokens: initialUsage.total_tokens + followUpUsage.total_tokens
          }
          
        } catch (error) {
          logger.error({ error }, 'Search function execution failed')
          finalResponse = message.content || 'Lo siento, hubo un error procesando tu consulta.'
        }
      }
    } else {
      // No function call needed, use direct response
      finalResponse = message.content || ''
    }

    if (!finalResponse) {
      throw new Error('No final response generated')
    }

    const usage = response.usage ?? { 
      prompt_tokens: 0, 
      completion_tokens: 0, 
      total_tokens: 0
    }

    // Calculate accurate cost using GPT-4.1 pricing (Chat Completions uses prompt/completion tokens)
    const costDetails = calculateAccurateCost(model, {
      input_tokens: usage.prompt_tokens,
      input_tokens_details: { cached_tokens: 0 }, // Chat Completions doesn't provide cached token info
      output_tokens: usage.completion_tokens
    })

    const totalCostCents = costDetails.cost_usd_cents + totalSearchCost

    logger.info({ 
      model,
      tokens: usage.total_tokens, 
      inputTokens: costDetails.input_tokens,
      cachedTokens: costDetails.cached_tokens,
      outputTokens: costDetails.output_tokens,
      openaiCostUsd: costDetails.cost_usd,
      openaiCostCents: costDetails.cost_usd_cents,
      searchCostCents: totalSearchCost,
      totalCostCents,
      searchUsed: Boolean(searchResult),
      sourcesFound: allSources.length,
      responseLength: finalResponse.length 
    }, 'Immigration question processed with accurate pricing')

    return {
      text: finalResponse,
      usage: {
        prompt_tokens: costDetails.input_tokens,
        completion_tokens: costDetails.output_tokens,
        total_tokens: costDetails.input_tokens + costDetails.output_tokens,
        input_tokens: costDetails.input_tokens,
        cached_tokens: costDetails.cached_tokens,
        output_tokens: costDetails.output_tokens
      },
      cost_details: costDetails,
      cost_cents: totalCostCents,
      search_used: Boolean(searchResult),
      search_cost_cents: totalSearchCost,
      sources: allSources
    }

  } catch (error) {
    logger.error({ error }, 'Error calling OpenAI API')
    
    // Provide fallback response for better UX
    const fallbackCostDetails = calculateAccurateCost(process.env.OPENAI_MODEL ?? 'gpt-4.1', {
      input_tokens: 0,
      output_tokens: 0
    })
    
    return {
      text: 'Lo siento, tengo dificultades técnicas en este momento. Por favor, intenta de nuevo en unos minutos o contacta con un profesional para consultas urgentes.',
      usage: { 
        prompt_tokens: 0, 
        completion_tokens: 0, 
        total_tokens: 0,
        input_tokens: 0,
        cached_tokens: 0,
        output_tokens: 0
      },
      cost_details: fallbackCostDetails,
      cost_cents: 0,
      search_used: false,
      search_cost_cents: 0,
      sources: []
    }
  }
}

// Simple function for testing purposes
export async function testOpenAIConnection(): Promise<boolean> {
  try {
    const response = await askImmigrationQuestion('Hola, ¿puedes ayudarme con información sobre extranjería?')
    return response.text.length > 0
  } catch (error) {
    logger.error({ error }, 'OpenAI connection test failed')
    return false
  }
}