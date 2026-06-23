'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function approveEntries(entryIds: string[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('time_entries')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .in('id', entryIds)

  if (error) throw new Error(error.message)
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
  revalidatePath('/projects', 'layout')
}

export async function rejectEntries(entryIds: string[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('time_entries')
    .update({ status: 'rejected' })
    .in('id', entryIds)

  if (error) throw new Error(error.message)
  revalidatePath('/approvals')
  revalidatePath('/projects', 'layout')
}
