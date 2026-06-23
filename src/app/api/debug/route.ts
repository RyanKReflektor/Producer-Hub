import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated', userError })
  }

  // Raw profile lookup
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, role, active, person_type')
    .eq('id', user.id)
    .single()

  // What role does the DB think this user has?
  const { data: roleCheck, error: roleError } = await supabase
    .rpc('get_user_role')

  // Raw assignments (no joins)
  const { data: assignments, error: assignmentsError } = await supabase
    .from('project_assignments')
    .select('*')

  // Projects accessible to this user
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, status, client')

  return NextResponse.json({
    auth_user_id: user.id,
    auth_user_email: user.email,
    profile,
    profileError,
    role_from_rpc: roleCheck,
    roleError,
    assignments,
    assignmentsError,
    projects,
    projectsError,
  })
}
