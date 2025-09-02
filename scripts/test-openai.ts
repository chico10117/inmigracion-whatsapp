import 'dotenv/config'
import { askImmigrationQuestion, testOpenAIConnection } from '../src/llm/openai'
import { isContentAppropriate } from '../src/llm/moderation'
import { logger } from '../src/utils/logger'

async function testOpenAIIntegration() {
  console.log('🧪 Testing OpenAI Integration...\n')
  
  // Test 1: Connection
  console.log('1. Testing OpenAI connection...')
  const isConnected = await testOpenAIConnection()
  console.log(`   ${isConnected ? '✅' : '❌'} Connection: ${isConnected ? 'OK' : 'FAILED'}\n`)
  
  if (!isConnected) {
    console.log('❌ OpenAI connection failed. Check your OPENAI_API_KEY in .env')
    return
  }

  // Test 2: Immigration questions
  const testQuestions = [
    '¿Cómo puedo renovar mi NIE?',
    '¿Qué documentos necesito para el arraigo social?',
    'Información sobre reagrupación familiar',
    'Hola, ¿puedes ayudarme?'
  ]

  for (const [index, question] of testQuestions.entries()) {
    console.log(`${index + 2}. Testing question: "${question}"`)
    try {
      const response = await askImmigrationQuestion(question)
      console.log(`   ✅ Response (${response.usage.total_tokens} tokens, ${response.cost_cents} cents):`)
      console.log(`   "${response.text.substring(0, 100)}${response.text.length > 100 ? '...' : ''}"`)
    } catch (error) {
      console.log(`   ❌ Error: ${error}`)
    }
    console.log('')
  }

  // Test 3: Content moderation
  console.log(`${testQuestions.length + 2}. Testing content moderation...`)
  const moderationTests = [
    { text: '¿Cómo renovar mi permiso de residencia?', shouldPass: true },
    { text: 'Ayuda con documentación de extranjería', shouldPass: true },
    { text: 'Información sobre visados', shouldPass: true }
  ]

  for (const test of moderationTests) {
    const isAppropriate = await isContentAppropriate(test.text)
    const result = isAppropriate === test.shouldPass ? '✅' : '❌'
    console.log(`   ${result} "${test.text}" → ${isAppropriate ? 'ALLOWED' : 'BLOCKED'}`)
  }

  console.log('\n🎉 OpenAI integration test completed!')
}

// Run tests
testOpenAIIntegration().catch(error => {
  logger.error({ error }, 'Test failed')
  process.exit(1)
})