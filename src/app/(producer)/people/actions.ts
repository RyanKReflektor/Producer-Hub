'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createPerson(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const email = formData.get('email') as string
  const name = formData.get('name') as string
  const role = formData.get('role') as string
  const personType = formData.get('person_type') as string
  const internalRate = formData.get('internal_rate') as string
  const externalRate = formData.get('external_rate') as string

  const admin = createAdminClient()

  // Invite the user — creates auth record, sends them a link to set their password
  const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(email)
  if (authError) throw new Error(authError.message)

  const title = formData.get('title') as string

  const { error: profileError } = await admin.from('profiles').insert({
    id: authData.user.id,
    email,
    name,
    role,
    person_type: personType || null,
    title: title || null,
    internal_rate: internalRate ? Number(internalRate) : null,
    external_rate: externalRate ? Number(externalRate) : null,
    active: true,
  })

  if (profileError) {
    // Roll back the auth user so we don't leave orphaned auth records
    await admin.auth.admin.deleteUser(authData.user.id)
    throw new Error(profileError.message)
  }

  revalidatePath('/people')
}

export async function updatePerson(id: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const name = formData.get('name') as string
  const role = formData.get('role') as string
  const personType = formData.get('person_type') as string
  const title = formData.get('title') as string
  const internalRate = formData.get('internal_rate') as string
  const externalRate = formData.get('external_rate') as string

  const { error } = await supabase.from('profiles').update({
    name,
    role,
    person_type: personType || null,
    title: title || null,
    internal_rate: internalRate ? Number(internalRate) : null,
    external_rate: externalRate ? Number(externalRate) : null,
  }).eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/people')
}

export async function togglePersonActive(id: string, active: boolean) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase.from('profiles').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/people')
}
