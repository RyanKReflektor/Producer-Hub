'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createProject(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const budgetType = formData.get('budget_type') as string
  const budgetValue = formData.get('budget_value') as string

  const { error } = await supabase.from('projects').insert({
    name: formData.get('name') as string,
    client: formData.get('client') as string,
    status: (formData.get('status') as string) || 'active',
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    budget_type: budgetType || null,
    budget_value: budgetValue ? Number(budgetValue) : null,
    currency: (formData.get('currency') as string) || 'CAD',
    created_by: user.id,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/projects')
  revalidatePath('/dashboard')
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const budgetType = formData.get('budget_type') as string
  const budgetValue = formData.get('budget_value') as string

  const { error } = await supabase.from('projects').update({
    name: formData.get('name') as string,
    client: formData.get('client') as string,
    status: formData.get('status') as string,
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    budget_type: budgetType || null,
    budget_value: budgetValue ? Number(budgetValue) : null,
    currency: (formData.get('currency') as string) || 'CAD',
  }).eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  revalidatePath('/dashboard')
}

export async function assignPersonToProject(
  projectId: string,
  personId: string,
  internalRate?: number,
  externalRate?: number
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase.from('project_assignments').upsert({
    project_id: projectId,
    person_id: personId,
    internal_rate_override: internalRate ?? null,
    external_rate_override: externalRate ?? null,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function removePersonFromProject(projectId: string, personId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('project_assignments')
    .delete()
    .eq('project_id', projectId)
    .eq('person_id', personId)

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}
