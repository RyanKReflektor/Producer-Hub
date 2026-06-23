import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getISOWeek, getMondayOfWeek } from '@/lib/utils'
import { TimesheetGrid } from '@/components/timesheet/timesheet-grid'
import { WeekNav } from '@/components/timesheet/week-nav'

interface TimesheetPageProps {
  searchParams: { week?: string }
}

export default async function TimesheetPage({ searchParams }: TimesheetPageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Determine week
  const now = new Date()
  let monday: Date

  if (searchParams.week) {
    const parsed = new Date(searchParams.week + 'T12:00:00')
    if (!isNaN(parsed.getTime())) {
      // Snap to the Monday of the week containing this date
      const dayOfWeek = parsed.getDay() || 7
      monday = new Date(parsed)
      monday.setDate(parsed.getDate() - (dayOfWeek - 1))
    } else {
      const { week, year } = getISOWeek(now)
      monday = getMondayOfWeek(week, year)
    }
  } else {
    const { week, year } = getISOWeek(now)
    monday = getMondayOfWeek(week, year)
  }

  const { week: currentWeekNum, year: currentYear } = getISOWeek(monday)

  // Get current week ISO
  const { week: thisWeek, year: thisYear } = getISOWeek(now)
  const currentMonday = getMondayOfWeek(thisWeek, thisYear)

  // Step 1: get project IDs this person is assigned to
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('project_id')
    .eq('person_id', user.id)

  const projectIds = (assignments || []).map(a => a.project_id)

  // Step 2: fetch those projects directly (avoids nested RLS in PostgREST join)
  // Note: no status filter — contributors should see all assigned projects so
  // they can log time even when a project is on_hold.
  const { data: assignedProjects } = projectIds.length > 0
    ? await supabase
        .from('projects')
        .select('id, name, client, status')
        .in('id', projectIds)
        .order('name')
    : { data: [] }

  // Get time entries for this week
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('person_id', user.id)
    .eq('week_number', currentWeekNum)
    .eq('year', currentYear)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">My Timesheet</h1>
          <p className="text-sm text-neutral-500 mt-1">Week {currentWeekNum}, {currentYear}</p>
        </div>
        <WeekNav monday={monday} currentMonday={currentMonday} />
      </div>

      <TimesheetGrid
        projects={(assignedProjects || []) as Array<{ id: string; name: string; client: string; status: string }>}
        timeEntries={timeEntries || []}
        monday={monday}
        week={currentWeekNum}
        year={currentYear}
      />
    </div>
  )
}
