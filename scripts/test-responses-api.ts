#!/usr/bin/env npx tsx
import dotenv from 'dotenv'
import { askImmigrationQuestion } from '../src/llm/openai'
import { createResponsesAPIClient } from '../src/llm/responses-api'

// Load environment variables
dotenv.config()

async function testResponsesAPI() {
  console.log('🧪 Testing Responses API Integration\n')
  console.log('=' .repeat(50))

  // Test 1: Basic Responses API client
  console.log('\n📋 Test 1: Direct Responses API Client')
  console.log('-'.repeat(40))
  
  try {
    const client = createResponsesAPIClient()
    const response = await client.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      input: '¿Qué es un NIE y para qué sirve?',
      max_tokens: 150,
      temperature: 0.7
    })
    
    console.log('✅ Direct API call successful')
    console.log('📊 Token usage:')
    console.log(`  - Input tokens: ${response.usage?.input_tokens || 0}`)
    console.log(`  - Cached tokens: ${response.usage?.cached_tokens || 0}`)
    console.log(`  - Output tokens: ${response.usage?.output_tokens || 0}`)
    const output = typeof response.output === 'string' ? response.output : JSON.stringify(response.output)
    console.log(`📝 Response preview: ${output.substring(0, 100)}...`)
    
  } catch (error) {
    console.error('❌ Direct API call failed:', error)
  }

  // Test 2: Immigration question with potential search
  console.log('\n📋 Test 2: Immigration Question (may trigger search)')
  console.log('-'.repeat(40))
  
  const testQuestions = [
    {
      question: '¿Cuáles son los cambios en la ley de extranjería para 2025?',
      expectSearch: true
    },
    {
      question: '¿Qué documentos necesito para renovar el NIE?',
      expectSearch: false
    }
  ]

  for (const test of testQuestions) {
    console.log(`\n🔍 Question: "${test.question}"`)
    console.log(`   Expected search: ${test.expectSearch ? 'YES' : 'NO'}`)
    
    try {
      const response = await askImmigrationQuestion(test.question)
      
      console.log('✅ Response received')
      console.log('📊 Token usage:')
      console.log(`  - Input tokens: ${response.usage.input_tokens}`)
      console.log(`  - Cached tokens: ${response.usage.cached_tokens}`)
      console.log(`  - Output tokens: ${response.usage.output_tokens}`)
      console.log(`🔍 Search used: ${response.search_used ? 'YES' : 'NO'}`)
      
      if (response.search_used) {
        console.log(`💰 Search cost: €${(response.search_cost_cents / 100).toFixed(3)}`)
        console.log(`📚 Sources found: ${response.sources.length}`)
      }
      
      console.log(`💰 Total cost: €${(response.cost_cents / 100).toFixed(3)}`)
      const responseText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text)
      console.log(`📝 Response preview: ${responseText.substring(0, 100)}...`)
      
    } catch (error) {
      console.error('❌ Question processing failed:', error)
    }
  }

  // Test 3: Conversation with history
  console.log('\n📋 Test 3: Conversation with Context')
  console.log('-'.repeat(40))
  
  try {
    // First message
    const response1 = await askImmigrationQuestion('¿Qué es el arraigo social?')
    console.log('✅ First message processed')
    console.log(`📊 Tokens: ${response1.usage.total_tokens} (cached: ${response1.usage.cached_tokens})`)
    
    // Follow-up with context
    const response2 = await askImmigrationQuestion(
      '¿Cuánto tiempo tarda el proceso?',
      [
        { role: 'user', content: '¿Qué es el arraigo social?' },
        { role: 'assistant', content: response1.text }
      ]
    )
    
    console.log('✅ Follow-up message processed')
    console.log(`📊 Tokens: ${response2.usage.total_tokens} (cached: ${response2.usage.cached_tokens})`)
    const response2Text = typeof response2.text === 'string' ? response2.text : JSON.stringify(response2.text)
    console.log(`🎯 Context preserved: ${response2Text.toLowerCase().includes('arraigo') ? 'YES' : 'NO'}`)
    
  } catch (error) {
    console.error('❌ Conversation test failed:', error)
  }

  // Test 4: Token caching behavior
  console.log('\n📋 Test 4: Token Caching Verification')
  console.log('-'.repeat(40))
  
  const cacheTestQuestion = '¿Qué es un certificado de empadronamiento?'
  
  try {
    // First call - should have minimal cached tokens
    const call1 = await askImmigrationQuestion(cacheTestQuestion)
    console.log('🔄 First call:')
    console.log(`  - Input: ${call1.usage.input_tokens}, Cached: ${call1.usage.cached_tokens}`)
    
    // Wait a moment then make same call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Second call - might have more cached tokens
    const call2 = await askImmigrationQuestion(cacheTestQuestion)
    console.log('🔄 Second call:')
    console.log(`  - Input: ${call2.usage.input_tokens}, Cached: ${call2.usage.cached_tokens}`)
    
    const cachingImproved = call2.usage.cached_tokens > call1.usage.cached_tokens
    console.log(`\n✨ Caching improvement: ${cachingImproved ? 'YES' : 'NO'}`)
    
    if (cachingImproved) {
      const savings = ((call1.usage.input_tokens - call2.usage.cached_tokens) * 2) / 1000000 * 100
      console.log(`💰 Cost savings from caching: €${savings.toFixed(4)}`)
    }
    
  } catch (error) {
    console.error('❌ Caching test failed:', error)
  }

  console.log('\n' + '='.repeat(50))
  console.log('✅ Responses API testing complete!')
}

// Run tests
testResponsesAPI().catch(console.error)