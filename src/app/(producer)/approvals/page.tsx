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
import { format } from 'date-fns'

export default async function ApprovalsPage() {
  // Use admin client for all reads on this page. The middleware already
  // verified the session is a producer; we use admin so PostgREST join
  // RLS issues don't silently swallow rows.
  const supabase = createAdminClient()

  const { data: submittedEntries } = await supabase
    .from('time_entries')
    .select('*, profile:profiles(id, name), project:projects(id, name, client)')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  const { data: recentEntries } = await supabase
    .from('time_entries')
    .select('*, profile:profiles(id, name), project:projects(id, name, client)')
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(20)

  // Group submitted by person+week
  type EntryGroup = {
    key: string
    personName: string
    personId: string
    week: number
    year: number
    totalHours: number
    submittedAt: string
    entryIds: string[]
    projectBreakdown: { projectName: string; hours: number }[]
  }

  const groupMap = new Map<string, EntryGroup>()
  for (const entry of (submittedEntries || [])) {
    const key = `${entry.person_id}-${entry.year}-${entry.week_number}`
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        personName: entry.profile?.name ?? 'Unknown',
        personId: entry.person_id,
        week: entry.week_number,
        year: entry.year,
        totalHours: 0,
        submittedAt: entry.submitted_at ?? '',
        entryIds: [],
        projectBreakdown: [],
      })
    }
    const g = groupMap.get(key)!
    g.totalHours += Number(entry.hours)
    g.entryIds.push(entry.id)
    const projectName = entry.project?.name ?? 'Unknown'
    const existing = g.projectBreakdown.find(p => p.projectName === projectName)
    if (existing) {
      existing.hours += Number(entry.hours)
    } else {
      g.projectBreakdown.push({ projectName, hours: Number(entry.hours) })
    }
  }

  const groups = Array.from(groupMap.values())

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-900">Approvals</h1>
        <p className="text-sm text-neutral-500 mt-1">Review and approve submitted timesheets</p>
      </div>

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
                    {group.submittedAt ? format(new Date(group.submittedAt), 'MMM d, yyyy h:mm a') : '—'}
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

      {/* Recent */}
      <div className="bg-white border border-neutral-200 rounded-[4px]">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-900">Recent Activity</h2>
        </div>
        {!recentEntries || recentEntries.length === 0 ? (
          <div className="px-4 py-8 text-center text-neutral-500 text-sm">
            No recent approval activity.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEntries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="text-neutral-700">{entry.profile?.name}</TableCell>
                  <TableCell className="text-neutral-700">{entry.project?.name}</TableCell>
                  <TableCell className="font-mono text-neutral-600 text-sm">
                    W{entry.week_number} {entry.year}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatHours(Number(entry.hours))}</TableCell>
                  <TableCell>
                    <Badge variant={entry.status as 'approved' | 'rejected'}>
                      {entry.status === 'approved' ? 'Approved' : 'Rejected'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
