import 'dotenv/config'
import { calculateAccurateCost, PRICING } from '../src/domain/calc'
import { logger } from '../src/utils/logger'

async function testAccuratePricing() {
  console.log('🧮 Testing Accurate GPT-4.1 Token Pricing...\\n')
  
  // Test case 1: Basic calculation without cached tokens
  console.log('📋 Test Case 1: Basic Cost Calculation (No Cache)')
  const testUsage1 = {
    input_tokens: 1200,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 300
  }
  
  const cost1 = calculateAccurateCost('gpt-4.1', testUsage1)
  console.log(`   Input tokens: ${cost1.input_tokens}`)
  console.log(`   Cached tokens: ${cost1.cached_tokens}`)
  console.log(`   Output tokens: ${cost1.output_tokens}`)
  console.log(`   Cost USD: $${cost1.cost_usd.toFixed(6)}`)
  console.log(`   Cost EUR cents: ${cost1.cost_eur_cents}`)
  console.log(`   Cost EUR: €${(cost1.cost_eur_cents / 100).toFixed(4)}`)
  
  // Manual verification
  const expectedUsdBase = 
    (1200 * PRICING["gpt-4.1"].input_per_token) +
    (0 * PRICING["gpt-4.1"].cached_input_per_token) +
    (300 * PRICING["gpt-4.1"].output_per_token)
  const expectedUsdWithMargin = expectedUsdBase * 1.15
  const expectedEurCents = Math.round(expectedUsdWithMargin * 0.92 * 100)
  
  console.log(`   Expected USD (base): $${expectedUsdBase.toFixed(6)}`)
  console.log(`   Expected USD (with margin): $${expectedUsdWithMargin.toFixed(6)}`)
  console.log(`   Expected EUR cents: ${expectedEurCents}`)
  console.log(`   ✅ Calculation ${cost1.cost_eur_cents === expectedEurCents ? 'CORRECT' : 'INCORRECT'}`)
  console.log('')

  // Test case 2: With cached tokens (should be cheaper)
  console.log('📋 Test Case 2: With Prompt Caching Savings')
  const testUsage2 = {
    input_tokens: 1200,
    input_tokens_details: { cached_tokens: 1024 },
    output_tokens: 300
  }
  
  const cost2 = calculateAccurateCost('gpt-4.1', testUsage2)
  console.log(`   Input tokens: ${cost2.input_tokens}`)
  console.log(`   Cached tokens: ${cost2.cached_tokens} (75% discount)`)
  console.log(`   Output tokens: ${cost2.output_tokens}`)
  console.log(`   Cost USD: $${cost2.cost_usd.toFixed(6)}`)
  console.log(`   Cost EUR cents: ${cost2.cost_eur_cents}`)
  console.log(`   Cost EUR: €${(cost2.cost_eur_cents / 100).toFixed(4)}`)
  
  const savings = cost1.cost_eur_cents - cost2.cost_eur_cents
  console.log(`   💰 Savings from caching: ${savings} cents (€${(savings/100).toFixed(4)})`)
  console.log('')

  // Test case 3: €3 limit simulation
  console.log('📋 Test Case 3: €3 Credit Limit Simulation')
  const totalBudgetCents = 300 // €3.00
  console.log(`   Total budget: ${totalBudgetCents} cents (€${(totalBudgetCents/100).toFixed(2)})`)
  
  // Simulate multiple queries to see how many fit in €3
  const avgQueryCost = cost1.cost_eur_cents
  const maxQueries = Math.floor(totalBudgetCents / avgQueryCost)
  const remainingAfterMax = totalBudgetCents - (maxQueries * avgQueryCost)
  
  console.log(`   Average query cost: ${avgQueryCost} cents (€${(avgQueryCost/100).toFixed(4)})`)
  console.log(`   Max queries in budget: ${maxQueries}`)
  console.log(`   Remaining after max queries: ${remainingAfterMax} cents (€${(remainingAfterMax/100).toFixed(4)})`)
  console.log('')

  // Test case 4: Model pricing comparison
  console.log('📋 Test Case 4: Model Pricing Comparison')
  const testUsage = { input_tokens: 1000, output_tokens: 200 }
  
  const gpt41Cost = calculateAccurateCost('gpt-4.1', testUsage)
  const gpt4oCost = calculateAccurateCost('gpt-4o', testUsage)
  
  console.log(`   GPT-4.1 cost: ${gpt41Cost.cost_eur_cents} cents (€${(gpt41Cost.cost_eur_cents/100).toFixed(4)})`)
  console.log(`   GPT-4o cost:  ${gpt4oCost.cost_eur_cents} cents (€${(gpt4oCost.cost_eur_cents/100).toFixed(4)})`)
  
  const difference = gpt4oCost.cost_eur_cents - gpt41Cost.cost_eur_cents
  console.log(`   Difference: ${difference} cents (GPT-4o is ${difference > 0 ? 'more' : 'less'} expensive)`)
  console.log('')

  // Test case 5: Real-world example costs
  console.log('📋 Test Case 5: Real-World Immigration Query Costs')
  const realWorldScenarios = [
    { name: 'Short question (¿Qué es un NIE?)', input: 500, output: 150 },
    { name: 'Medium question (visa requirements)', input: 800, output: 250 },
    { name: 'Complex question with context', input: 1200, output: 400 },
    { name: 'Long conversation turn', input: 1500, output: 500 }
  ]
  
  realWorldScenarios.forEach(scenario => {
    const cost = calculateAccurateCost('gpt-4.1', {
      input_tokens: scenario.input,
      output_tokens: scenario.output
    })
    console.log(`   ${scenario.name}:`)
    console.log(`     Tokens: ${scenario.input} in + ${scenario.output} out = ${scenario.input + scenario.output} total`)
    console.log(`     Cost: ${cost.cost_eur_cents} cents (€${(cost.cost_eur_cents/100).toFixed(4)})`)
    console.log(`     Queries in €3: ~${Math.floor(300 / cost.cost_eur_cents)}`)
  })
  
  console.log('\\n🎉 Accurate Pricing Test Completed!')
  console.log('\\n💡 Key Insights:')
  console.log('• GPT-4.1 is cost-effective for immigration queries')
  console.log('• Prompt caching provides significant savings for repeated context')
  console.log('• €3 budget allows for substantial number of quality interactions')
  console.log('• Accurate per-token pricing ensures fair usage tracking')
}

// Run the test
testAccuratePricing().catch(error => {
  logger.error({ error }, 'Accurate pricing test failed')
  process.exit(1)
})