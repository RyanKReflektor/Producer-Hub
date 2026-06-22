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

  // Get assigned projects
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('project_id, project:projects(id, name, client, status)')
    .eq('person_id', user.id)

  const assignedProjects = (assignments || [])
    .map(a => a.project)
    .filter(Boolean)
    .filter(p => p!.status === 'active')

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
        projects={assignedProjects as Array<{ id: string; name: string; client: string; status: string }>}
        timeEntries={timeEntries || []}
        monday={monday}
        week={currentWeekNum}
        year={currentYear}
      />
    </div>
  )
}
