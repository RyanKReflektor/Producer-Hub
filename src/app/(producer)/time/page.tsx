export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getISOWeek, getMondayOfWeek } from '@/lib/utils'
import { ProducerTimesheetGrid } from '@/components/timesheet/producer-timesheet-grid'
import { WeekNav } from '@/components/timesheet/week-nav'

interface PageProps {
  searchParams: { week?: string }
}

export default async function ProducerTimesheetPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  let monday: Date
  if (searchParams.week) {
    const parsed = new Date(searchParams.week + 'T12:00:00')
    if (!isNaN(parsed.getTime())) {
      const dow = parsed.getDay() || 7
      monday = new Date(parsed)
      monday.setDate(parsed.getDate() - (dow - 1))
    } else {
      const { week, year } = getISOWeek(now)
      monday = getMondayOfWeek(week, year)
    }
  } else {
    const { week, year } = getISOWeek(now)
    monday = getMondayOfWeek(week, year)
  }

  const { week: weekNum, year } = getISOWeek(monday)
  const { week: thisWeek, year: thisYear } = getISOWeek(now)
  const currentMonday = getMondayOfWeek(thisWeek, thisYear)

  // Producers can bill to any project — including completed ones (late billing,
  // post-delivery fixes). Active/in-flight projects sort first, completed last.
  const admin = createAdminClient()
  const { data: allProjects } = await admin
    .from('projects')
    .select('id, name, client, status')
    .order('name')
  const projects = (allProjects || []).sort((a, b) => {
    const ac = a.status === 'completed' ? 1 : 0
    const bc = b.status === 'completed' ? 1 : 0
    return ac - bc || a.name.localeCompare(b.name)
  })

  // Read by actual date range (Mon–Sun), not week_number/year — the date column
  // is unambiguous, so entries always come back regardless of how the ISO week
  // was computed at save time.
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('person_id', user.id)
    .gte('date', iso(monday))
    .lte('date', iso(sunday))

  return (
    <>
      <div className="bg-[#0F0F0F] px-8 py-12">
        <h1 className="text-6xl font-light text-white leading-none tracking-tight">Timesheet</h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="w-8 h-px bg-neutral-700" />
          <p className="text-sm text-neutral-500">Your billable hours · Week {weekNum}, {year}</p>
        </div>
      </div>
      <div className="p-8">
        <div className="flex items-center justify-end mb-4">
          <WeekNav monday={monday} currentMonday={currentMonday} basePath="/time" />
        </div>
        <ProducerTimesheetGrid
          projects={(projects || []) as Array<{ id: string; name: string; client: string; status: string }>}
          timeEntries={timeEntries || []}
          monday={monday}
        />
      </div>
    </>
  )
}
