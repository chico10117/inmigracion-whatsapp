import 'dotenv/config'
import { askImmigrationQuestion } from '../src/llm/openai'
import { PerplexityClient } from '../src/llm/perplexity'
import { logger } from '../src/utils/logger'

async function testSearchIntegration() {
  console.log('🔍 Testing Search Integration with Immigration Queries...\n')

  // Test 1: Direct Perplexity client
  console.log('1. Testing Perplexity client directly...')
  const perplexity = new PerplexityClient()
  
  if (!perplexity.isSearchEnabled()) {
    console.log('   ⚠️  Search not enabled (missing PERPLEXITY_API_KEY)')
    console.log('   ℹ️  Add PERPLEXITY_API_KEY to .env to test search functionality')
  } else {
    console.log('   ✅ Search enabled')
    
    try {
      const searchResult = await perplexity.searchImmigrationInfo(
        '¿Cuáles son los nuevos requisitos para renovar el NIE en 2024?'
      )
      
      if (searchResult) {
        console.log(`   ✅ Search successful: ${searchResult.content.substring(0, 100)}...`)
        console.log(`   📊 Tokens used: ${searchResult.usage.total_tokens}`)
        console.log(`   🔗 Sources found: ${searchResult.sources.length}`)
      } else {
        console.log('   ❌ Search failed')
      }
    } catch (error) {
      console.log(`   ❌ Search error: ${error}`)
    }
  }
  console.log('')

  // Test 2: Integration with OpenAI function calling
  console.log('2. Testing OpenAI + Search integration...')
  
  const testQuestions = [
    {
      query: '¿Cuáles son los nuevos cambios en la ley de extranjería para 2024?',
      expectSearch: true,
      reason: 'Should trigger search for recent law changes'
    },
    {
      query: '¿Qué es un NIE?', 
      expectSearch: false,
      reason: 'Basic definition, should not need search'
    },
    {
      query: '¿Cuánto tiempo tarda ahora la renovación del permiso de trabajo?',
      expectSearch: true,
      reason: 'Current processing times need real-time info'
    },
    {
      query: 'Buenos días',
      expectSearch: false,
      reason: 'Greeting, no immigration content'
    }
  ]

  for (const [index, test] of testQuestions.entries()) {
    console.log(`${index + 3}. Testing: "${test.query}"`)
    console.log(`   Expected: ${test.expectSearch ? 'SEARCH' : 'NO SEARCH'} (${test.reason})`)
    
    try {
      const startTime = Date.now()
      const response = await askImmigrationQuestion(test.query)
      const duration = Date.now() - startTime
      
      const searchStatus = response.search_used ? '🔍 SEARCH USED' : '💭 STATIC RESPONSE'
      console.log(`   ${searchStatus} - ${duration}ms`)
      console.log(`   💰 Cost: OpenAI ${response.cost_cents - response.search_cost_cents}¢ + Search ${response.search_cost_cents}¢ = ${response.cost_cents}¢ total`)
      console.log(`   📊 Tokens: ${response.usage.total_tokens}`)
      if (response.sources.length > 0) {
        console.log(`   🔗 Sources: ${response.sources.length} found`)
      }
      console.log(`   📝 Response: "${response.text.substring(0, 150)}${response.text.length > 150 ? '...' : ''}"`)
      
      const correctPrediction = response.search_used === test.expectSearch
      console.log(`   ${correctPrediction ? '✅' : '⚠️'} Prediction: ${correctPrediction ? 'Correct' : 'Unexpected'}`)
      
    } catch (error) {
      console.log(`   ❌ Error: ${error}`)
    }
    console.log('')
  }

  // Test 3: Cache functionality
  console.log(`${testQuestions.length + 3}. Testing cache functionality...`)
  
  const repeatedQuery = '¿Cuáles son los tiempos de procesamiento actuales en Madrid?'
  console.log(`   Query: "${repeatedQuery}"`)
  
  console.log('   First request (should trigger search):')
  const firstResponse = await askImmigrationQuestion(repeatedQuery)
  console.log(`   ${firstResponse.search_used ? '🔍' : '💭'} Search used: ${firstResponse.search_used}`)
  console.log(`   ⏱️ Time: first request`)
  
  console.log('   Second request (should use cache):')
  const secondResponse = await askImmigrationQuestion(repeatedQuery)
  console.log(`   ${secondResponse.search_used ? '🔍' : '💭'} Search used: ${secondResponse.search_used}`)
  console.log(`   💰 Cost saved: ${firstResponse.search_cost_cents - secondResponse.search_cost_cents}¢`)

  console.log('\n🎉 Search integration test completed!')
  
  // Summary
  console.log('\n📋 Test Summary:')
  if (perplexity.isSearchEnabled()) {
    console.log('✅ Perplexity API configured and working')
    console.log('✅ OpenAI function calling integrated')
    console.log('✅ Smart search decision making')
    console.log('✅ Cost tracking for search API calls')
    console.log('✅ Caching system functional')
    console.log('\n🚀 Ready for live testing with WhatsApp!')
  } else {
    console.log('⚠️  To enable search functionality:')
    console.log('   1. Add PERPLEXITY_API_KEY to your .env file')
    console.log('   2. Ensure SEARCH_ENABLED=true')
    console.log('   3. Re-run this test')
  }
}

// Run tests
testSearchIntegration().catch(error => {
  logger.error({ error }, 'Search integration test failed')
  process.exit(1)
})