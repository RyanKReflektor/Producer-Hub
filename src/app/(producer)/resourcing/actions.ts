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

// ── Shift timeline ───────────────────────────────────────────────────────────
// Move every allocation that starts on/after `fromDate` by (toDate - fromDate),
// optionally limited to one project. Returns the updated rows so the client can
// patch its state without a full reload.
export async function shiftTimeline(
  projectId: string | null,
  fromDate: string,
  toDate: string,
): Promise<{ id: string; start_date: string; end_date: string }[]> {
  const { supabase } = await requireProducer()
  const from = new Date(`${fromDate}T00:00:00`)
  const to = new Date(`${toDate}T00:00:00`)
  const delta = Math.round((to.getTime() - from.getTime()) / 86400000)
  if (delta === 0) return []

  let q = supabase.from('resource_allocations').select('id, start_date, end_date').gte('start_date', fromDate)
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const addDaysISO = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const updated: { id: string; start_date: string; end_date: string }[] = []
  for (const a of data ?? []) {
    const start_date = addDaysISO(a.start_date, delta)
    const end_date = addDaysISO(a.end_date, delta)
    const { error: e2 } = await supabase
      .from('resource_allocations')
      .update({ start_date, end_date, updated_at: new Date().toISOString() })
      .eq('id', a.id)
    if (e2) throw new Error(e2.message)
    updated.push({ id: a.id, start_date, end_date })
  }
  revalidatePath('/resourcing')
  return updated
}

// ── Resource people (placeholders / vendors) ─────────────────────────────────
export async function createResourcePerson(
  name: string,
  kind: ResourcePersonKind,
  title: string,
  tags: string[],
  color: string,
  dailyHours: number,
): Promise<ResourcePerson> {
  const { supabase, userId } = await requireProducer()
  const { data, error } = await supabase
    .from('resource_people')
    .insert({ name, kind, title: title || null, tags, color: color || null, daily_hours: dailyHours, created_by: userId })
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
  tags: string[],
  color: string,
  dailyHours: number,
): Promise<void> {
  const { supabase } = await requireProducer()
  const { error } = await supabase
    .from('resource_people')
    .update({ name, kind, title: title || null, tags, color: color || null, daily_hours: dailyHours })
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
