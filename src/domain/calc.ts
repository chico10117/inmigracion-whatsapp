export function toCentsUSD(usd: number): number {
  return Math.round(usd * 100)
}

// GPT-4.1 pricing per token (USD)
export const PRICING = {
  "gpt-4.1": {
    input_per_token: 2 / 1_000_000,         // $2.00 per 1M tokens
    cached_input_per_token: 0.5 / 1_000_000, // $0.50 per 1M tokens (cached)
    output_per_token: 8 / 1_000_000,         // $8.00 per 1M tokens
  },
  "gpt-4o": {
    input_per_token: 2.5 / 1_000_000,       // $2.50 per 1M tokens  
    cached_input_per_token: 1.25 / 1_000_000, // $1.25 per 1M tokens (cached)
    output_per_token: 10 / 1_000_000,        // $10.00 per 1M tokens
  }
}

export interface UsageDetails {
  input_tokens: number
  cached_tokens: number
  output_tokens: number
  cost_usd: number
  cost_usd_cents: number
}

export function calculateAccurateCost(model: string, usage: {
  input_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens?: number
}): UsageDetails {
  const input = usage?.input_tokens ?? 0
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0
  const output = usage?.output_tokens ?? 0
  
  // Use GPT-4.1 pricing as default, fallback to GPT-4o pricing
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING["gpt-4.1"]
  
  // Calculate billable tokens
  const billableInputTokens = Math.max(0, input - cached)
  const billableCachedTokens = cached
  const billableOutputTokens = output
  
  // Calculate USD cost with precise per-token pricing
  const cost_usd = 
    billableInputTokens * pricing.input_per_token +
    billableCachedTokens * pricing.cached_input_per_token +
    billableOutputTokens * pricing.output_per_token
  
  // Add margin for infrastructure costs
  const costMultiplier = Number(process.env.COST_MULTIPLIER ?? 1.15)
  const usdWithMargin = cost_usd * costMultiplier
  
  // Convert to USD cents
  const cost_usd_cents = toCentsUSD(usdWithMargin)
  
  return {
    input_tokens: input,
    cached_tokens: cached,
    output_tokens: output,
    cost_usd: usdWithMargin,
    cost_usd_cents
  }
}

// Legacy function for backward compatibility
export function estimateCostCents({
  prompt_tokens, 
  completion_tokens
}: { 
  prompt_tokens: number, 
  completion_tokens: number 
}): number {
  return calculateAccurateCost("gpt-4.1", {
    input_tokens: prompt_tokens,
    output_tokens: completion_tokens
  }).cost_usd_cents
}