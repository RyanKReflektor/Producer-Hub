'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  ResourceAllocation,
  TimeOff,
  TimeOffType,
  ResourcePerson,
  ResourcePersonKind,
  Milestone,
} from '@/lib/types'

async function requireProducer() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return { supabase, userId: user.id }
}

// An allocation / time-off row is owned by exactly one of these.
export interface OwnerRef {
  personId: string | null
  resourcePersonId: string | null
}

export async function createAllocation(
  owner: OwnerRef,
  projectId: string,
  startDate: string,
  endDate: string,
  hoursPerDay: number,
  note: string,
): Promise<ResourceAllocation> {
  const { supabase } = await requireProducer()
  const { data, error } = await supabase
    .from('resource_allocations')
    .insert({
      person_id: owner.personId,
      resource_person_id: owner.resourcePersonId,
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
  owner: OwnerRef,
  projectId: string,
  startDate: string,
  endDate: string,
  hoursPerDay: number,
  note: string,
): Promise<void> {
  const { supabase } = await requireProducer()
  const { error } = await supabase
    .from('resource_allocations')
    .update({
      person_id: owner.personId,
      resource_person_id: owner.resourcePersonId,
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
  const { supabase } = await requireProducer()
  const { error } = await supabase.from('resource_allocations').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}

export async function createTimeOff(
  owner: OwnerRef,
  startDate: string,
  endDate: string,
  type: TimeOffType,
  note: string,
): Promise<TimeOff> {
  const { supabase } = await requireProducer()
  const { data, error } = await supabase
    .from('time_off')
    .insert({
      person_id: owner.personId,
      resource_person_id: owner.resourcePersonId,
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
  const { supabase } = await requireProducer()
  const { error } = await supabase.from('time_off').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}

// ── Resource people (placeholders / vendors) ─────────────────────────────────
export async function createResourcePerson(
  name: string,
  kind: ResourcePersonKind,
  title: string,
  color: string,
  dailyHours: number,
): Promise<ResourcePerson> {
  const { supabase, userId } = await requireProducer()
  const { data, error } = await supabase
    .from('resource_people')
    .insert({ name, kind, title: title || null, color: color || null, daily_hours: dailyHours, created_by: userId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
  return data as ResourcePerson
}

export async function updateResourcePerson(
  id: string,
  name: string,
  kind: ResourcePersonKind,
  title: string,
  color: string,
  dailyHours: number,
): Promise<void> {
  const { supabase } = await requireProducer()
  const { error } = await supabase
    .from('resource_people')
    .update({ name, kind, title: title || null, color: color || null, daily_hours: dailyHours })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}

export async function deleteResourcePerson(id: string): Promise<void> {
  const { supabase } = await requireProducer()
  const { error } = await supabase.from('resource_people').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}

// ── Milestones ───────────────────────────────────────────────────────────────
export async function createMilestone(
  projectId: string,
  date: string,
  name: string,
): Promise<Milestone> {
  const { supabase } = await requireProducer()
  const { data, error } = await supabase
    .from('milestones')
    .insert({ project_id: projectId, date, name })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
  return data as Milestone
}

export async function deleteMilestone(id: string): Promise<void> {
  const { supabase } = await requireProducer()
  const { error } = await supabase.from('milestones').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/resourcing')
}
