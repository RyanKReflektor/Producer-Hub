'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Expense, ExpenseType } from '@/lib/types'

export async function addExpense(
  projectId: string,
  expenseType: ExpenseType,
  label: string,
  amount: number,
  quantity: number,
  notes: string | null,
): Promise<Expense> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('expenses')
    .insert({ project_id: projectId, expense_type: expenseType, label, amount, quantity, notes, added_by: user.id })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  return data as Expense
}

export async function updateExpense(
  id: string,
  projectId: string,
  expenseType: ExpenseType,
  label: string,
  amount: number,
  quantity: number,
  notes: string | null,
): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('expenses')
    .update({ expense_type: expenseType, label, amount, quantity, notes })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteExpense(id: string, projectId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}
