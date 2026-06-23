import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getISOWeek } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On Hold',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  on_hold: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export default async function ContributorDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const now = new Date()
  const { week, year } = getISOWeek(now)

  const [assignmentsResult, timeEntriesResult] = await Promise.all([
    supabase.from('project_assignments').select('project_id').eq('person_id', user.id),
    supabase
      .from('time_entries')
      .select('hours, status')
      .eq('person_id', user.id)
      .eq('week_number', week)
      .eq('year', year),
  ])

  const projectIds = (assignmentsResult.data || []).map(a => a.project_id)
  const entries = timeEntriesResult.data || []

  const totalHours = entries.reduce((sum, e) => sum + (e.hours ?? 0), 0)
  const submittedHours = entries
    .filter(e => e.status === 'submitted' || e.status === 'approved')
    .reduce((sum, e) => sum + (e.hours ?? 0), 0)
  const approvedHours = entries
    .filter(e => e.status === 'approved')
    .reduce((sum, e) => sum + (e.hours ?? 0), 0)

  const supabaseAdmin = createAdminClient()
  const { data: projects } = projectIds.length > 0
    ? await supabaseAdmin
        .from('projects')
        .select('id, name, client, status, start_date, end_date')
        .in('id', projectIds)
        .order('name')
    : { data: [] }

  return (
    <>
      {/* Hero header */}
      <div className="bg-[#0F0F0F] px-8 py-12">
        <h1 className="text-6xl font-light text-white leading-none tracking-tight">
          Welcome, {profile?.name ?? 'there'}
        </h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="w-8 h-px bg-neutral-700" />
          <p className="text-sm text-neutral-500">Week {week}, {year}</p>
        </div>
      </div>

    <div className="p-8 max-w-3xl">
      {/* Hours this week */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3 uppercase tracking-wider text-xs">Hours This Week</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px] px-4 py-3">
            <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Logged</p>
          </div>
          <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px] px-4 py-3">
            <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{submittedHours.toFixed(1)}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Submitted</p>
          </div>
          <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px] px-4 py-3">
            <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{approvedHours.toFixed(1)}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Approved</p>
          </div>
        </div>
      </section>

      {/* My Projects */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3 uppercase tracking-wider text-xs">My Projects</h2>
        {!projects || projects.length === 0 ? (
          <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px] px-4 py-8 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">You haven&apos;t been assigned to any projects yet.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px] divide-y divide-neutral-100 dark:divide-[#222]">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/my-projects/${project.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-[#f0f0f0] group-hover:underline truncate">{project.name}</p>
                  <p className="text-xs text-neutral-400 dark:text-[#555] mt-0.5 truncate">{project.client}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {project.start_date && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 hidden sm:block">
                      {new Date(project.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {project.end_date && ` – ${new Date(project.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[project.status] ?? STATUS_COLOR.active}`}>
                    {STATUS_LABEL[project.status] ?? project.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
    </>
  )
}
