export function toCentsEUR(usd: number): number {
  const rate = Number(process.env.USD_EUR_RATE ?? 0.92)
  return Math.round(usd * rate * 100)
}

export function estimateCostCents({
  prompt_tokens, 
  completion_tokens
}: { 
  prompt_tokens: number, 
  completion_tokens: number 
}): number {
  const inputPriceUSD = Number(process.env.PRICE_INPUT_PER_MTOK_USD ?? 3.0)
  const outputPriceUSD = Number(process.env.PRICE_OUTPUT_PER_MTOK_USD ?? 12.0)
  
  const inUSD =
    (prompt_tokens / 1_000_000) * inputPriceUSD +
    (completion_tokens / 1_000_000) * outputPriceUSD
    
  const costMultiplier = Number(process.env.COST_MULTIPLIER ?? 1.15)
  const usdWithMargin = inUSD * costMultiplier
  
  return toCentsEUR(usdWithMargin)
}