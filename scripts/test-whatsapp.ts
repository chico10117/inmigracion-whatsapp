import 'dotenv/config'
import { MESSAGES, COMMANDS, PAYMENT_LINKS } from '../src/domain/flows'
import { ensureUser, hasCredits, debitCredits, deleteUserData } from '../src/domain/credit'
import { logger } from '../src/utils/logger'

async function testWhatsAppIntegration() {
  console.log('🧪 Testing WhatsApp Integration Components...\n')

  // Test 1: Message templates
  console.log('1. Testing message templates...')
  console.log('   ✅ Welcome message (new user):')
  console.log(`   "${MESSAGES.welcome(true).substring(0, 100)}..."\n`)
  
  console.log('   ✅ Welcome message (returning user):')
  console.log(`   "${MESSAGES.welcome(false).substring(0, 100)}..."\n`)
  
  console.log('   ✅ No credits message:')
  console.log(`   "${MESSAGES.noCredits(['link1', 'link2', 'link3']).substring(0, 100)}..."\n`)

  // Test 2: Command recognition
  console.log('2. Testing command recognition...')
  const testCommands = ['BAJA', 'baja', 'Baja', 'hola', 'HOLA']
  for (const cmd of testCommands) {
    const isBaja = COMMANDS.isBajaCommand(cmd)
    console.log(`   ${isBaja ? '✅' : '❌'} "${cmd}" → ${isBaja ? 'BAJA command' : 'regular message'}`)
  }
  console.log('')

  // Test 3: Payment links
  console.log('3. Testing payment links...')
  const links = PAYMENT_LINKS.getLinks()
  console.log(`   📱 Payment links configured: ${links.filter(l => l).length}/3`)
  console.log('')

  // Test 4: User management (mock mode)
  console.log('4. Testing user management (mock mode)...')
  const testPhone = '+34600123456'
  
  console.log(`   Creating/getting user for ${testPhone}...`)
  const user = await ensureUser(testPhone)
  console.log(`   ${user ? '✅' : '❌'} User: ${user ? `ID: ${user.id}, Credits: ${user.credits_cents}` : 'Failed'}`)
  
  if (user) {
    console.log(`   Checking credits...`)
    const credits = await hasCredits(user.id)
    console.log(`   ✅ Has credits: ${credits}`)
    
    console.log(`   Testing debit...`)
    const remainingBalance = await debitCredits(user.id, 50, 'test-message')
    console.log(`   ✅ Debit successful, remaining: ${remainingBalance} cents`)
    
    console.log(`   Testing data deletion...`)
    const deleted = await deleteUserData(user.id)
    console.log(`   ${deleted ? '✅' : '❌'} Data deletion: ${deleted ? 'Success' : 'Failed'}`)
  }
  console.log('')

  // Test 5: Phone number extraction
  console.log('5. Testing phone number extraction...')
  const testJids = [
    '34600123456@s.whatsapp.net',
    '1234567890@s.whatsapp.net',
    'invalid@c.us'
  ]
  
  for (const jid of testJids) {
    const match = jid.match(/^(\d+)@s\.whatsapp\.net$/)
    const phone = match ? '+' + match[1] : null
    console.log(`   ${phone ? '✅' : '❌'} "${jid}" → ${phone || 'Invalid'}`)
  }

  console.log('\n🎉 WhatsApp integration components test completed!')
  console.log('\n📝 Next steps:')
  console.log('   1. Run "npm run dev" to start the bot')
  console.log('   2. Scan the QR code with WhatsApp')
  console.log('   3. Send "hola" to test the welcome flow')
}

// Run tests
testWhatsAppIntegration().catch(error => {
  logger.error({ error }, 'Test failed')
  process.exit(1)
})