'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getISOWeek } from '@/lib/utils'

// Producers log their own billable time. Entries are written straight to
// 'approved' — producers don't need approval — and stay editable at any time.
export async function saveProducerTime(
  projectId: string,
  date: string,
  hours: number,
  description?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { week, year } = getISOWeek(new Date(`${date}T12:00:00`))

  const { data: existing } = await supabase
    .from('time_entries')
    .select('id')
    .eq('person_id', user.id)
    .eq('project_id', projectId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    if (hours <= 0) {
      await supabase.from('time_entries').delete().eq('id', existing.id)
    } else {
      const { error } = await supabase.from('time_entries').update({
        hours,
        description: description ?? null,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      }).eq('id', existing.id)
      if (error) throw new Error(error.message)
    }
  } else if (hours > 0) {
    const { error } = await supabase.from('time_entries').insert({
      person_id: user.id,
      project_id: projectId,
      date,
      hours,
      description: description ?? null,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      week_number: week,
      year,
    })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/time')
  revalidatePath('/dashboard')
}
