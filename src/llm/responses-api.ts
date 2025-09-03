import { logger } from '../utils/logger'

export interface ResponsesAPIConfig {
  apiKey: string
  baseURL?: string
}

export interface ResponsesAPIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: any[]
  tool_call_id?: string
}

export interface ResponsesAPITool {
  type: 'function' | 'web_search'
  function?: {
    name: string
    description: string
    parameters: any
  }
}

export interface ResponsesAPIRequest {
  model: string
  messages?: ResponsesAPIMessage[]
  input?: string | ResponsesAPIMessage[]
  tools?: ResponsesAPITool[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } } | { type: 'web_search' }
  max_tokens?: number
  temperature?: number
  stream?: boolean
  modality?: string
}

export interface ResponsesAPIUsage {
  input_tokens: number
  cached_tokens: number
  output_tokens: number
}

export interface ResponsesAPIResponse {
  id: string
  object: string
  created: number
  model: string
  output: string | null
  usage?: ResponsesAPIUsage
  tool_calls?: any[]
}

class ResponsesAPIClient {
  private apiKey: string
  private baseURL: string

  constructor(config: ResponsesAPIConfig) {
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL || 'https://api.openai.com/v1'
  }

  async create(request: ResponsesAPIRequest): Promise<ResponsesAPIResponse> {
    // Try Responses API first, fallback to Chat Completions if not available
    const responsesUrl = `${this.baseURL}/responses`
    const chatUrl = `${this.baseURL}/chat/completions`
    
    try {
      logger.info({ 
        model: request.model, 
        hasTools: Boolean(request.tools?.length),
        streaming: request.stream || false,
        endpoint: 'responses'
      }, 'Making Responses API request')

      // Try true Responses API format first (minimal parameters only)
      let responsesRequest: any = {
        model: request.model
      }
      
      // Only add supported parameters for Responses API
      if (request.temperature !== undefined) {
        responsesRequest.temperature = request.temperature
      }

      // Handle input - can be string or messages array
      if (request.input) {
        if (typeof request.input === 'string') {
          responsesRequest.input = request.input
        } else {
          // If input is messages array, convert to single input string for simplicity
          const lastUserMessage = Array.isArray(request.input) 
            ? request.input.filter(m => m.role === 'user').pop()?.content
            : null
          responsesRequest.input = lastUserMessage || 'Hello'
        }
      } else if (request.messages) {
        // Convert messages to input format, incorporating system prompt
        const systemMessage = request.messages.find(m => m.role === 'system')
        const lastUserMessage = request.messages.filter(m => m.role === 'user').pop()?.content
        
        // Combine system prompt with user message for Responses API
        if (systemMessage && lastUserMessage) {
          responsesRequest.input = `${systemMessage.content}\n\nUser: ${lastUserMessage}`
        } else if (lastUserMessage) {
          responsesRequest.input = lastUserMessage
        } else {
          responsesRequest.input = 'Hello'
        }
      }

      if (request.tools?.length) {
        // Convert Chat Completions tool format to Responses API format
        responsesRequest.tools = request.tools.map(tool => {
          if (tool.type === 'function') {
            return {
              type: 'function',  // Keep the type field
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters
            }
          }
          return tool
        })
      }

      // Try Responses API endpoint
      let response = await fetch(responsesUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(responsesRequest)
      })

      // If Responses API fails (404, 403, 400 for unknown params), fallback to Chat Completions
      if (!response.ok && (response.status === 404 || response.status === 403 || response.status === 400)) {
        const errorText = await response.text()
        logger.info({ 
          status: response.status, 
          error: errorText.substring(0, 200) + '...' 
        }, 'Responses API failed, falling back to Chat Completions')
        
        // Fallback to Chat Completions format
        const chatRequest: any = {
          model: request.model,
          messages: request.messages || [
            { role: 'user', content: request.input }
          ]
        }

        // Add optional parameters for Chat Completions
        if (request.max_tokens !== undefined) {
          chatRequest.max_tokens = request.max_tokens
        }
        if (request.temperature !== undefined) {
          chatRequest.temperature = request.temperature
        }

        if (request.tools?.length) {
          chatRequest.tools = request.tools
          chatRequest.tool_choice = request.tool_choice || 'auto'
        }

        response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(chatRequest)
        })

        if (!response.ok) {
          const error = await response.text()
          logger.error({ status: response.status, error }, 'Chat Completions fallback failed')
          throw new Error(`API request failed: ${response.status} - ${error}`)
        }

        const chatData: any = await response.json()
        const message = chatData.choices?.[0]?.message
        
        return {
          id: chatData.id,
          object: 'chat.completion',
          created: chatData.created,
          model: chatData.model,
          output: message?.content || null,
          usage: chatData.usage ? {
            input_tokens: chatData.usage.prompt_tokens || 0,
            cached_tokens: 0, // Chat Completions doesn't provide this
            output_tokens: chatData.usage.completion_tokens || 0
          } : undefined,
          tool_calls: message?.tool_calls
        }
      }

      if (!response.ok) {
        const error = await response.text()
        logger.error({ status: response.status, error }, 'Responses API request failed')
        throw new Error(`API request failed: ${response.status} - ${error}`)
      }

      const data: any = await response.json()
      
      // Handle true Responses API response
      logger.info({ 
        responseType: 'responses_api',
        dataKeys: Object.keys(data),
        outputType: Array.isArray(data.output) ? 'array' : typeof data.output,
        usagePresent: Boolean(data.usage)
      }, 'Successfully used Responses API - debugging response structure')
      
      // Parse output from Responses API format (which returns an array of messages)
      let outputText = null
      let toolCalls = null
      
      if (Array.isArray(data.output)) {
        // Find the text content from the message array
        for (const message of data.output) {
          logger.info({
            messageType: message.type,
            hasContent: Boolean(message.content),
            contentType: Array.isArray(message.content) ? 'array' : typeof message.content
          }, 'Parsing message from output array')
          
          if (message.type === 'message' && message.content) {
            // Content can be an array of blocks
            if (Array.isArray(message.content)) {
              logger.info({ 
                contentLength: message.content.length,
                contentBlocks: message.content.map(block => ({ 
                  type: block.type, 
                  hasText: Boolean(block.text),
                  textLength: block.text ? block.text.length : 0 
                }))
              }, 'Examining content array structure')
              
              // Look for text block (could be 'text' or 'output_text')
              const textBlock = message.content.find(block => 
                block.type === 'text' || block.type === 'output_text'
              )
              if (textBlock && textBlock.text) {
                outputText = textBlock.text
                logger.info({ 
                  blockType: textBlock.type,
                  textLength: textBlock.text.length 
                }, 'Found text block')
              }
            } else if (typeof message.content === 'string') {
              outputText = message.content
              logger.info({ textLength: message.content.length }, 'Found string content')
            }
          }
          
          // Handle function_call type messages
          if (message.type === 'function_call') {
            logger.info({
              messageKeys: Object.keys(message),
              functionName: message.function?.name,
              hasArguments: Boolean(message.function?.arguments),
              name: message.name,
              arguments: message.arguments
            }, 'Found function call message - debugging structure')
            
            // Extract tool calls from function_call message
            // Try different possible structures
            let functionName = message.function?.name || message.name
            let functionArguments = message.function?.arguments || message.arguments
            
            if (functionName) {
              toolCalls = [{
                id: message.id || 'function_call_1',
                type: 'function',
                function: {
                  name: functionName,
                  arguments: functionArguments
                }
              }]
              
              logger.info({
                extractedName: functionName,
                extractedArgs: functionArguments
              }, 'Extracted function call details')
            } else {
              logger.warn('Could not extract function call details from message')
            }
          }
          
          // Extract tool calls if present
          if (message.tool_calls) {
            toolCalls = message.tool_calls
          }
        }
      } else if (data.output) {
        outputText = data.output
        logger.info({ outputType: typeof data.output }, 'Using direct output')
      }
      
      // Also check for direct text field (Responses API might have this)
      if (!outputText && data.text) {
        if (typeof data.text === 'string') {
          outputText = data.text
          logger.info({ textLength: data.text.length }, 'Using direct text string')
        } else if (data.text && data.text.content) {
          // Handle object format like { content: "actual text" }
          outputText = data.text.content
          logger.info({ textLength: data.text.content.length }, 'Using text.content field')
        } else if (data.text && typeof data.text === 'object') {
          // Log the structure to understand it better
          logger.info({ 
            textKeys: Object.keys(data.text),
            textType: typeof data.text 
          }, 'Text field is object, investigating structure')
          
          // Try common text fields
          if (data.text.text) {
            outputText = data.text.text
          } else if (data.text.value) {
            outputText = data.text.value
          }
        }
      }
      
      // Log final parsing results
      logger.info({
        outputTextLength: outputText ? outputText.length : 0,
        hasToolCalls: Boolean(toolCalls),
        usageTokens: data.usage
      }, 'Responses API parsing complete')
      
      return {
        id: data.id,
        object: data.object || 'response',
        created: data.created || Date.now(),
        model: data.model,
        output: outputText,
        usage: data.usage ? {
          input_tokens: data.usage.input_tokens || 0,
          cached_tokens: data.usage.cached_tokens || 0,
          output_tokens: data.usage.output_tokens || 0
        } : undefined,
        tool_calls: toolCalls
      }

    } catch (error) {
      logger.error({ error }, 'Error in Responses API request')
      throw error
    }
  }

  async createWithTools(
    request: ResponsesAPIRequest,
    onToolCall: (toolCall: any) => Promise<string>
  ): Promise<ResponsesAPIResponse> {
    // Initial request
    const initialResponse = await this.create(request)
    
    // If no tool calls, return as-is
    if (!initialResponse.tool_calls?.length) {
      return initialResponse
    }

    // Process tool calls
    const toolResults = await Promise.all(
      initialResponse.tool_calls.map(async (toolCall) => {
        const result = await onToolCall(toolCall)
        return {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: result
        }
      })
    )

    // Make follow-up request with tool results
    const followUpRequest: ResponsesAPIRequest = {
      ...request,
      messages: [
        ...(request.messages || [{ role: 'user', content: request.input as string }]),
        { 
          role: 'assistant', 
          content: null, 
          tool_calls: initialResponse.tool_calls 
        },
        ...toolResults
      ]
    }

    const finalResponse = await this.create(followUpRequest)
    
    // Aggregate usage from both requests
    if (initialResponse.usage && finalResponse.usage) {
      finalResponse.usage = {
        input_tokens: initialResponse.usage.input_tokens + finalResponse.usage.input_tokens,
        cached_tokens: initialResponse.usage.cached_tokens + finalResponse.usage.cached_tokens,
        output_tokens: initialResponse.usage.output_tokens + finalResponse.usage.output_tokens
      }
    }

    return finalResponse
  }
}

// Export the client class
export { ResponsesAPIClient }

// Factory function for creating client
export function createResponsesAPIClient(apiKey?: string): ResponsesAPIClient {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error('OpenAI API key is required')
  }
  
  return new ResponsesAPIClient({ apiKey: key })
}