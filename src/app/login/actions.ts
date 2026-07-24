'use server'

import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_DOMAIN = '@reflektor.digital'

// Self-service registration, gated to the company domain. Creates a confirmed
// auth user (so they can sign in immediately) plus a matching profile. New
// self-registrations default to 'contributor' — a producer can elevate anyone
// who needs full access from the People page.
export async function registerReflektorUser(name: string, email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const cleanName = name.trim()

  if (!normalized.endsWith(ALLOWED_DOMAIN)) {
    throw new Error(`Registration is limited to ${ALLOWED_DOMAIN} email addresses.`)
  }
  if (!cleanName) throw new Error('Please enter your name.')
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.')

  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  })
  if (error) {
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      throw new Error('An account with this email already exists — sign in or reset your password instead.')
    }
    throw new Error(error.message)
  }

  const userId = data.user.id
  const { error: profileError } = await admin.from('profiles').insert({
    id: userId,
    email: normalized,
    name: cleanName,
    role: 'contributor',
    person_type: 'employee',
    active: true,
  })
  if (profileError) {
    // Roll back the auth user so a retry starts clean
    await admin.auth.admin.deleteUser(userId)
    throw new Error(profileError.message)
  }
}
