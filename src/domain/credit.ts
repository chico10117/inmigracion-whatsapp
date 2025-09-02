import { supa } from '../db/supabase'
import { logger } from '../utils/logger'
import { PAYMENT_LINKS } from './flows'

export interface User {
  id: string
  phone_e164: string
  credits_cents: number
  created_at: string
  lang: string
  is_blocked: boolean
}

export async function ensureUser(phoneE164: string): Promise<User | null> {
  try {
    if (!supa) {
      logger.warn('Supabase not configured, using mock user')
      return {
        id: 'mock-user',
        phone_e164: phoneE164,
        credits_cents: 300,
        created_at: new Date().toISOString(),
        lang: 'es',
        is_blocked: false
      }
    }

    // Check if user exists
    const { data: existingUser } = await supa
      .from('users')
      .select('*')
      .eq('phone_e164', phoneE164)
      .maybeSingle()

    if (existingUser) {
      return existingUser as User
    }

    // Create new user with initial credits
    const initialCredits = Number(process.env.BOT_INIT_CREDITS_CENTS ?? 300)
    
    const { data: newUser, error } = await supa
      .from('users')
      .insert({
        phone_e164: phoneE164,
        credits_cents: initialCredits,
        lang: 'es'
      })
      .select('*')
      .single()

    if (error) {
      logger.error({ error }, 'Failed to create user')
      return null
    }

    // Log initial credit grant
    if (newUser) {
      await supa.from('credit_ledger').insert({
        user_id: newUser.id,
        delta_cents: initialCredits,
        reason: 'init_grant'
      })
      
      logger.info({ userId: newUser.id, credits: initialCredits }, 'New user created with initial credits')
    }

    return newUser as User

  } catch (error) {
    logger.error({ error, phoneE164 }, 'Error ensuring user')
    return null
  }
}

export async function hasCredits(userId: string): Promise<boolean> {
  try {
    if (!supa || userId === 'mock-user') {
      return true // Mock user always has credits for testing
    }

    const { data } = await supa
      .from('users')
      .select('credits_cents')
      .eq('id', userId)
      .single()

    return (data?.credits_cents ?? 0) > 0

  } catch (error) {
    logger.error({ error, userId }, 'Error checking user credits')
    return false
  }
}

export async function debitCredits(
  userId: string, 
  costCents: number, 
  messageId?: string
): Promise<number> {
  try {
    if (!supa || userId === 'mock-user') {
      logger.info({ userId, costCents }, 'Mock debit for testing')
      return 250 // Mock remaining balance
    }

    const { data: user } = await supa
      .from('users')
      .select('credits_cents')
      .eq('id', userId)
      .single()

    if (!user) {
      logger.error({ userId }, 'User not found for debit')
      return 0
    }

    const newBalance = Math.max(0, user.credits_cents - costCents)

    // Update user balance
    await supa
      .from('users')
      .update({ credits_cents: newBalance })
      .eq('id', userId)

    // Log transaction
    await supa.from('credit_ledger').insert({
      user_id: userId,
      delta_cents: -costCents,
      reason: 'chat_spend',
      ref_id: messageId
    })

    logger.info({ 
      userId, 
      costCents, 
      oldBalance: user.credits_cents, 
      newBalance 
    }, 'Credits debited')

    return newBalance

  } catch (error) {
    logger.error({ error, userId, costCents }, 'Error debiting credits')
    return 0
  }
}

export function getTopupLinks(): string[] {
  return PAYMENT_LINKS.getLinks()
}

export async function deleteUserData(userId: string): Promise<boolean> {
  try {
    if (!supa || userId === 'mock-user') {
      logger.info({ userId }, 'Mock user data deletion')
      return true
    }

    // Delete user (cascade will handle related records)
    const { error } = await supa
      .from('users')
      .delete()
      .eq('id', userId)

    if (error) {
      logger.error({ error, userId }, 'Failed to delete user data')
      return false
    }

    logger.info({ userId }, 'User data deleted successfully')
    return true

  } catch (error) {
    logger.error({ error, userId }, 'Error deleting user data')
    return false
  }
}