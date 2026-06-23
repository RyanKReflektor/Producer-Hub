import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated', userError })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, role, active, person_type')
    .eq('id', user.id)
    .single()

  const { data: roleCheck, error: roleError } = await supabase.rpc('get_user_role')

  // What time_entries does RLS allow this user to see?
  const { data: timeEntries, error: timeEntriesError } = await supabase
    .from('time_entries')
    .select('id, status, person_id, project_id, hours, week_number, year')
    .order('created_at', { ascending: false })
    .limit(10)

  // What does the admin client see? (bypasses RLS — shows ground truth)
  const { data: adminTimeEntries, error: adminTimeEntriesError } = await supabaseAdmin
    .from('time_entries')
    .select('id, status, person_id, project_id, hours, week_number, year')
    .order('created_at', { ascending: false })
    .limit(10)

  // Assignments visible to this session
  const { data: assignments, error: assignmentsError } = await supabase
    .from('project_assignments')
    .select('*')

  // Projects visible to this session
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
    timeEntries_via_rls: timeEntries,
    timeEntriesError,
    timeEntries_via_admin: adminTimeEntries,
    adminTimeEntriesError,
    assignments,
    assignmentsError,
    projects,
    projectsError,
  })
}
