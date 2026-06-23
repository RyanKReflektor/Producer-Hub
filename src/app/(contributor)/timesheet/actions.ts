'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getISOWeek } from '@/lib/utils'

export async function saveTimeEntry(
  projectId: string,
  date: string,
  hours: number,
  description?: string
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const dateObj = new Date(date + 'T12:00:00')
  const { week, year } = getISOWeek(dateObj)

  // Check if entry exists
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id, status')
    .eq('person_id', user.id)
    .eq('project_id', projectId)
    .eq('date', date)
    .single()

  if (existing) {
    if (existing.status === 'submitted' || existing.status === 'approved') {
      throw new Error('Cannot edit submitted or approved entries')
    }
    if (hours === 0) {
      await supabase.from('time_entries').delete().eq('id', existing.id)
    } else {
      await supabase.from('time_entries').update({
        hours,
        description: description ?? null,
        status: 'draft',
      }).eq('id', existing.id)
    }
  } else if (hours > 0) {
    await supabase.from('time_entries').insert({
      person_id: user.id,
      project_id: projectId,
      date,
      hours,
      description: description ?? null,
      status: 'draft',
      week_number: week,
      year,
    })
  }

  revalidatePath('/timesheet')
}

export async function submitWeek(week: number, year: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('time_entries')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('person_id', user.id)
    .eq('week_number', week)
    .eq('year', year)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)
  revalidatePath('/timesheet')
  revalidatePath('/approvals')
  revalidatePath('/dashboard')
}

export async function unlockWeek(week: number, year: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('time_entries')
    .update({ status: 'draft', submitted_at: null })
    .eq('person_id', user.id)
    .eq('week_number', week)
    .eq('year', year)
    .in('status', ['submitted', 'approved', 'rejected'])

  if (error) throw new Error(error.message)
  revalidatePath('/timesheet')
  revalidatePath('/approvals')
  revalidatePath('/projects', 'layout')
  revalidatePath('/dashboard')
}
