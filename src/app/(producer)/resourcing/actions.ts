'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ResourceAllocation, TimeOff, TimeOffType } from '@/lib/types'

async function requireProducer() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return supabase
}

export async function createAllocation(
  personId: string,
  projectId: string,
  startDate: string,
  endDate: string,
  hoursPerDay: number,
  note: string,
): Promise<ResourceAllocation> {
  const supabase = await requireProducer()
  const { data, error } = await supabase
    .from('resource_allocations')
    .insert({
      person_id: personId,
      project_id: projectId,
      start_date: startDate,
      end_date: endDate,
      hours_per_day: hoursPerDay,
      note: note || null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
  return data as ResourceAllocation
}

export async function updateAllocation(
  id: string,
  personId: string,
  projectId: string,
  startDate: string,
  endDate: string,
  hoursPerDay: number,
  note: string,
): Promise<void> {
  const supabase = await requireProducer()
  const { error } = await supabase
    .from('resource_allocations')
    .update({
      person_id: personId,
      project_id: projectId,
      start_date: startDate,
      end_date: endDate,
      hours_per_day: hoursPerDay,
      note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}

export async function deleteAllocation(id: string): Promise<void> {
  const supabase = await requireProducer()
  const { error } = await supabase.from('resource_allocations').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}

export async function createTimeOff(
  personId: string,
  startDate: string,
  endDate: string,
  type: TimeOffType,
  note: string,
): Promise<TimeOff> {
  const supabase = await requireProducer()
  const { data, error } = await supabase
    .from('time_off')
    .insert({
      person_id: personId,
      start_date: startDate,
      end_date: endDate,
      type,
      note: note || null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
  return data as TimeOff
}

export async function deleteTimeOff(id: string): Promise<void> {
  const supabase = await requireProducer()
  const { error } = await supabase.from('time_off').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}
