export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { formatHours } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApproveActions } from '@/components/approvals/approve-actions'
import { RecentActivityAccordion } from '@/components/approvals/recent-activity-accordion'
import type { RecentGroup as AccordionRecentGroup } from '@/components/approvals/recent-activity-accordion'
import { format } from 'date-fns'

export default async function ApprovalsPage() {
  const supabase = createAdminClient()

  // Fetch time entries without embeds — embed FK resolution can fail silently
  const { data: submittedEntries, error: submittedError } = await supabase
    .from('time_entries')
    .select('id, person_id, project_id, hours, week_number, year, submitted_at, status')
    .eq('status', 'submitted')
    .order('year', { ascending: false })
    .order('week_number', { ascending: false })

  const { data: recentEntries } = await supabase
    .from('time_entries')
    .select('id, person_id, project_id, hours, week_number, year, status, updated_at, date')
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(100)

  // Gather unique IDs for lookup
  const allEntries = [...(submittedEntries || []), ...(recentEntries || [])]
  const personIds = Array.from(new Set(allEntries.map(e => e.person_id)))
  const projectIds = Array.from(new Set(allEntries.map(e => e.project_id)))

  // Fetch profiles and projects by ID — no embeds, no FK magic
  const { data: profiles } = personIds.length > 0
    ? await supabase.from('profiles').select('id, name, email').in('id', personIds)
    : { data: [] }

  const { data: projects } = projectIds.length > 0
    ? await supabase.from('projects').select('id, name, client').in('id', projectIds)
    : { data: [] }

  const profileMap = new Map((profiles || []).map(p => [p.id, p]))
  const projectMap = new Map((projects || []).map(p => [p.id, p]))

  // Group submitted entries by person + week
  type EntryGroup = {
    key: string
    personName: string
    personId: string
    week: number
    year: number
    totalHours: number
    submittedAt: string | null
    entryIds: string[]
    projectBreakdown: { projectName: string; hours: number }[]
  }

  const groupMap = new Map<string, EntryGroup>()
  for (const entry of (submittedEntries || [])) {
    const key = `${entry.person_id}-${entry.year}-${entry.week_number}`
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        personName: profileMap.get(entry.person_id)?.name ?? 'Unknown',
        personId: entry.person_id,
        week: entry.week_number,
        year: entry.year,
        totalHours: 0,
        submittedAt: entry.submitted_at ?? null,
        entryIds: [],
        projectBreakdown: [],
      })
    }
    const g = groupMap.get(key)!
    g.totalHours += Number(entry.hours)
    g.entryIds.push(entry.id)
    const projectName = projectMap.get(entry.project_id)?.name ?? 'Unknown project'
    const existing = g.projectBreakdown.find(p => p.projectName === projectName)
    if (existing) {
      existing.hours += Number(entry.hours)
    } else {
      g.projectBreakdown.push({ projectName, hours: Number(entry.hours) })
    }
  }

  const groups = Array.from(groupMap.values())

  // Group recent (approved/rejected) entries by person + week
  const recentGroupMap = new Map<string, AccordionRecentGroup>()
  for (const entry of (recentEntries || [])) {
    const key = `${entry.person_id}-${entry.year}-${entry.week_number}-${entry.status}`
    if (!recentGroupMap.has(key)) {
      recentGroupMap.set(key, {
        key,
        personName: profileMap.get(entry.person_id)?.name ?? 'Unknown',
        week: entry.week_number,
        year: entry.year,
        totalHours: 0,
        status: entry.status,
        resolvedAt: entry.updated_at ?? null,
        projectBreakdown: [],
        entries: [],
      })
    }
    const g = recentGroupMap.get(key)!
    g.totalHours += Number(entry.hours)
    g.entries.push({ id: entry.id, project_id: entry.project_id, date: entry.date, hours: Number(entry.hours) })
    const projectId = entry.project_id
    const projectName = projectMap.get(entry.project_id)?.name ?? 'Unknown project'
    const existing = g.projectBreakdown.find(p => p.projectId === projectId)
    if (existing) {
      existing.hours += Number(entry.hours)
    } else {
      g.projectBreakdown.push({ projectId, projectName, hours: Number(entry.hours) })
    }
  }

  const recentGroups = Array.from(recentGroupMap.values())

  return (
    <>
      <div className="bg-[#0F0F0F] px-8 py-12">
        <h1 className="text-6xl font-light text-white leading-none tracking-tight">Approvals</h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="w-8 h-px bg-neutral-700" />
          <p className="text-sm text-neutral-500">Review and approve submitted timesheets</p>
        </div>
      </div>
    <div className="p-8">
      {submittedError && (
        <p className="text-xs text-red-500 mb-4 font-mono">Query error: {submittedError.message}</p>
      )}

      {/* Pending */}
      <div className="bg-white border border-neutral-200 rounded-[4px] mb-6">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-neutral-900">Pending Review</h2>
          {groups.length > 0 && (
            <Badge variant="submitted">{groups.length} pending</Badge>
          )}
        </div>
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-neutral-500 text-sm">
            No pending timesheets to review.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(group => (
                <TableRow key={group.key}>
                  <TableCell className="font-medium text-neutral-900">{group.personName}</TableCell>
                  <TableCell className="font-mono text-neutral-600 text-sm">
                    W{group.week} {group.year}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {group.projectBreakdown.map(p => (
                        <div key={p.projectName} className="text-xs text-neutral-500">
                          {p.projectName} — <span className="font-mono">{formatHours(p.hours)}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-neutral-900">
                    {formatHours(group.totalHours)}
                  </TableCell>
                  <TableCell className="text-neutral-500 text-xs">
                    {group.submittedAt
                      ? format(new Date(group.submittedAt), 'MMM d, yyyy h:mm a')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <ApproveActions entryIds={group.entryIds} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-white border border-neutral-200 rounded-[4px]">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-900">Recent Activity</h2>
        </div>
        <RecentActivityAccordion groups={recentGroups} />
      </div>
    </div>
    </>
  )
}
