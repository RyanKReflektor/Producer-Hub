export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { formatCurrency, formatHours } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BurnChart } from '@/components/projects/burn-chart'
import { ProjectDetailActions } from '@/components/projects/project-detail-actions'
import { ApproveActions } from '@/components/approvals/approve-actions'
import { AssignPeople } from '@/components/projects/assign-people'
import { ProjectLinks } from '@/components/projects/project-links'
import { ProjectTabNav } from '@/components/projects/project-tab-nav'
import { FinancialsTab } from '@/components/projects/financials-tab'
import type { ProjectStatus, ProjectLink, Expense } from '@/lib/types'
import { format } from 'date-fns'

function StatusBadge({ status }: { status: ProjectStatus }) {
  const variantMap: Record<ProjectStatus, 'active' | 'completed' | 'on_hold'> = {
    active: 'active',
    completed: 'completed',
    on_hold: 'on_hold',
  }
  const labels: Record<ProjectStatus, string> = {
    active: 'Active',
    completed: 'Completed',
    on_hold: 'On Hold',
  }
  return <Badge variant={variantMap[status]}>{labels[status]}</Badge>
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const activeTab = searchParams.tab === 'financials' ? 'financials' : 'overview'
  const supabase = createAdminClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!project) notFound()

  // Get assignments — include estimated_hours for financials labour table
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('id, person_id, project_id, internal_rate_override, external_rate_override, estimated_hours')
    .eq('project_id', params.id)

  // Get project links
  const { data: projectLinks } = await supabase
    .from('project_links')
    .select('*')
    .eq('project_id', params.id)
    .order('added_at', { ascending: true })

  // Get all time entries (submitted + approved)
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('id, person_id, project_id, hours, week_number, year, status, submitted_at, date')
    .eq('project_id', params.id)
    .in('status', ['submitted', 'approved'])
    .order('year', { ascending: true })
    .order('week_number', { ascending: true })

  // Get pending entries for approval
  const { data: pendingEntries } = await supabase
    .from('time_entries')
    .select('id, person_id, project_id, hours, week_number, year, status, submitted_at')
    .eq('project_id', params.id)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  // Get expenses
  const { data: expensesData } = await supabase
    .from('expenses')
    .select('*')
    .eq('project_id', params.id)
    .order('added_at', { ascending: true })

  // Gather unique person IDs
  const allPersonIds = Array.from(new Set([
    ...(assignments || []).map(a => a.person_id),
    ...(timeEntries || []).map(e => e.person_id),
    ...(pendingEntries || []).map(e => e.person_id),
  ]))
  const { data: entryProfiles } = allPersonIds.length > 0
    ? await supabase.from('profiles').select('id, name, email, person_type, internal_rate, external_rate').in('id', allPersonIds)
    : { data: [] }
  const profileMap = new Map((entryProfiles || []).map(p => [p.id, p]))

  // Get all active contributors (for assignment dialog)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, name, email, person_type, internal_rate, external_rate, active, role')
    .eq('active', true)
    .eq('role', 'contributor')
    .order('name')

  // Assignment map keyed by person_id for rate lookups
  const assignmentMap = new Map(
    (assignments || []).map(a => [a.person_id, a])
  )

  const effectiveInternalRate = (personId: string) => {
    const a = assignmentMap.get(personId)
    return Number(a?.internal_rate_override ?? profileMap.get(personId)?.internal_rate ?? 0)
  }
  const effectiveExternalRate = (personId: string) => {
    const a = assignmentMap.get(personId)
    return Number(a?.external_rate_override ?? profileMap.get(personId)?.external_rate ?? 0)
  }

  // Calculate overview totals (submitted + approved)
  const totalHours = (timeEntries || []).reduce((sum, e) => sum + Number(e.hours), 0)
  const totalInternalCost = (timeEntries || []).reduce((sum, e) =>
    sum + Number(e.hours) * effectiveInternalRate(e.person_id), 0)
  const totalExternalCost = (timeEntries || []).reduce((sum, e) =>
    sum + Number(e.hours) * effectiveExternalRate(e.person_id), 0)

  // Budget remaining (overview)
  let budgetRemaining: number | null = null
  let budgetPct: number | null = null
  if (project.budget_value) {
    if (project.budget_type === 'hours') {
      budgetRemaining = project.budget_value - totalHours
      budgetPct = (totalHours / project.budget_value) * 100
    } else if (project.budget_type === 'dollars') {
      budgetRemaining = project.budget_value - totalInternalCost
      budgetPct = (totalInternalCost / project.budget_value) * 100
    }
  }

  // Weekly burn data for chart
  type WeekKey = `${number}-${number}`
  const weekMap = new Map<WeekKey, { week_label: string; hours: number; internal_cost: number }>()
  for (const entry of (timeEntries || [])) {
    const key = `${entry.year}-${entry.week_number}` as WeekKey
    if (!weekMap.has(key)) {
      weekMap.set(key, { week_label: `W${entry.week_number}`, hours: 0, internal_cost: 0 })
    }
    const existing = weekMap.get(key)!
    weekMap.set(key, {
      ...existing,
      hours: existing.hours + Number(entry.hours),
      internal_cost: existing.internal_cost + Number(entry.hours) * effectiveInternalRate(entry.person_id),
    })
  }
  const weeklyBurn = Array.from(weekMap.values())

  // Person breakdown (for overview tab)
  const personMap = new Map<string, { name: string; hours: number; internal_cost: number; external_cost: number }>()
  for (const entry of (timeEntries || [])) {
    if (!personMap.has(entry.person_id)) {
      personMap.set(entry.person_id, {
        name: profileMap.get(entry.person_id)?.name ?? 'Unknown',
        hours: 0,
        internal_cost: 0,
        external_cost: 0,
      })
    }
    const existing = personMap.get(entry.person_id)!
    personMap.set(entry.person_id, {
      ...existing,
      hours: existing.hours + Number(entry.hours),
      internal_cost: existing.internal_cost + Number(entry.hours) * effectiveInternalRate(entry.person_id),
      external_cost: existing.external_cost + Number(entry.hours) * effectiveExternalRate(entry.person_id),
    })
  }
  const personBreakdown = Array.from(personMap.values())

  // Group pending entries by person+week
  type EntryGroup = {
    key: string
    personName: string
    week: number
    year: number
    totalHours: number
    submittedAt: string
    entryIds: string[]
  }
  const pendingGroups = new Map<string, EntryGroup>()
  for (const entry of (pendingEntries || [])) {
    const key = `${entry.person_id}-${entry.year}-${entry.week_number}`
    if (!pendingGroups.has(key)) {
      pendingGroups.set(key, {
        key,
        personName: profileMap.get(entry.person_id)?.name ?? 'Unknown',
        week: entry.week_number,
        year: entry.year,
        totalHours: 0,
        submittedAt: entry.submitted_at ?? '',
        entryIds: [],
      })
    }
    const g = pendingGroups.get(key)!
    g.totalHours += Number(entry.hours)
    g.entryIds.push(entry.id)
  }
  const approvalGroups = Array.from(pendingGroups.values())

  // Build assigned people list for the panel
  const assignedPeople = (assignments || []).map(a => {
    const p = profileMap.get(a.person_id)
    return {
      assignment_id: a.id,
      person_id: a.person_id,
      name: p?.name ?? 'Unknown',
      email: p?.email ?? '',
      person_type: p?.person_type ?? null,
      internal_rate_override: a.internal_rate_override,
      external_rate_override: a.external_rate_override,
      default_internal_rate: p?.internal_rate ?? null,
      default_external_rate: p?.external_rate ?? null,
    }
  })

  const assignedIds = new Set(assignedPeople.map(a => a.person_id))
  const availablePeople = (allProfiles || []).filter(p => !assignedIds.has(p.id))

  // Labour rows for financials tab (approved only)
  const approvedEntries = (timeEntries || []).filter(e => e.status === 'approved')
  const labourRows = (assignments || []).map(a => {
    const profile = profileMap.get(a.person_id)
    const personEntries = approvedEntries.filter(e => e.person_id === a.person_id)
    const actualHours = personEntries.reduce((sum, e) => sum + Number(e.hours), 0)
    const internalRate = effectiveInternalRate(a.person_id)
    const externalRate = effectiveExternalRate(a.person_id)
    const estimatedHours = a.estimated_hours ? Number(a.estimated_hours) : null
    return {
      personId: a.person_id,
      name: profile?.name ?? 'Unknown',
      personType: profile?.person_type ?? null,
      estimatedHours,
      actualHours,
      hrsRemaining: estimatedHours !== null ? estimatedHours - actualHours : null,
      internalRate,
      actualInternalCost: actualHours * internalRate,
      externalRate,
      actualExternalCost: actualHours * externalRate,
    }
  })

  // SOW Total for financials (only meaningful for dollar budgets)
  const sowTotal = project.budget_type === 'dollars' ? Number(project.budget_value) : null

  return (
    <>
      {/* Hero header */}
      <div className="bg-[#0F0F0F] px-8 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-6xl font-light text-white leading-none tracking-tight">{project.name}</h1>
            <div className="mt-5 flex items-center gap-4">
              <div className="w-8 h-px bg-neutral-700" />
              <p className="text-sm text-neutral-500">
                {project.client}
                {project.start_date && (
                  <> &middot; {format(new Date(project.start_date), 'MMM d, yyyy')}
                  {project.end_date && ` – ${format(new Date(project.end_date), 'MMM d, yyyy')}`}</>
                )}
              </p>
              <StatusBadge status={project.status} />
            </div>
          </div>
          <ProjectDetailActions project={project} />
        </div>
      </div>

    <div className="p-8">
      {/* Tab navigation */}
      <ProjectTabNav activeTab={activeTab} />

      {/* ── Overview tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Total Hours</p>
              <p className="text-2xl font-mono font-semibold text-neutral-900">{formatHours(totalHours)}</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Internal Cost</p>
              <p className="text-2xl font-mono font-semibold text-neutral-900">{formatCurrency(totalInternalCost, project.currency)}</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">External Cost</p>
              <p className="text-2xl font-mono font-semibold text-neutral-900">{formatCurrency(totalExternalCost, project.currency)}</p>
            </div>
            <div className={`border rounded-[4px] p-4 ${
              budgetPct !== null && budgetPct >= 100 ? 'bg-red-50 border-red-200' :
              budgetPct !== null && budgetPct >= 80 ? 'bg-amber-50 border-amber-200' :
              'bg-white border-neutral-200'
            }`}>
              <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Budget Remaining</p>
              {project.budget_value ? (
                <p className={`text-2xl font-mono font-semibold ${
                  budgetPct !== null && budgetPct >= 100 ? 'text-red-600' :
                  budgetPct !== null && budgetPct >= 80 ? 'text-amber-600' :
                  'text-neutral-900'
                }`}>
                  {project.budget_type === 'hours'
                    ? formatHours(budgetRemaining ?? 0)
                    : formatCurrency(budgetRemaining ?? 0, project.currency)}
                </p>
              ) : (
                <p className="text-lg text-neutral-400">No budget set</p>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="mb-6">
            <BurnChart data={weeklyBurn} currency={project.currency} />
          </div>

          {/* Assigned people */}
          <AssignPeople
            projectId={project.id}
            assigned={assignedPeople}
            available={availablePeople as any}
          />

          {/* Resources */}
          <ProjectLinks
            projectId={project.id}
            projectName={project.name}
            clientName={project.client}
            initialLinks={(projectLinks ?? []) as ProjectLink[]}
            isProducer={true}
          />

          {/* People breakdown */}
          <div className="bg-white border border-neutral-200 rounded-[4px] mb-6">
            <div className="px-4 py-3 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">People Breakdown</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Internal Cost</TableHead>
                  <TableHead className="text-right">External Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-neutral-500 py-6">
                      No approved time entries yet
                    </TableCell>
                  </TableRow>
                ) : (
                  personBreakdown.map(person => (
                    <TableRow key={person.name}>
                      <TableCell className="font-medium text-neutral-900">{person.name}</TableCell>
                      <TableCell className="text-right font-mono">{formatHours(person.hours)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(person.internal_cost, project.currency)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(person.external_cost, project.currency)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pending approvals */}
          {approvalGroups.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-[4px]">
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">Pending Approvals</h2>
                <Badge variant="submitted">{approvalGroups.length} pending</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalGroups.map(group => (
                    <TableRow key={group.key}>
                      <TableCell className="font-medium text-neutral-900">{group.personName}</TableCell>
                      <TableCell className="font-mono text-neutral-600">W{group.week} {group.year}</TableCell>
                      <TableCell className="text-right font-mono">{formatHours(group.totalHours)}</TableCell>
                      <TableCell className="text-neutral-500 text-xs">
                        {group.submittedAt ? format(new Date(group.submittedAt), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        <ApproveActions entryIds={group.entryIds} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* ── Financials tab ────────────────────────────────────────────────────── */}
      {activeTab === 'financials' && (
        <FinancialsTab
          projectId={project.id}
          currency={project.currency}
          sowTotal={sowTotal}
          labourRows={labourRows}
          initialExpenses={(expensesData ?? []) as Expense[]}
        />
      )}
    </div>
    </>
  )
}
