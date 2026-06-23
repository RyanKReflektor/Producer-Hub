export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { formatCurrency, formatHours, getISOWeek } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import type { ProjectStatus } from '@/lib/types'

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

export default async function DashboardPage() {
  const supabaseUser = createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabaseUser
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const supabase = createAdminClient()
  const now = new Date()
  const { week, year } = getISOWeek(now)

  // Get all projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  // Get time entries for this week (no embeds — FK resolution can fail silently)
  const { data: weekEntries } = await supabase
    .from('time_entries')
    .select('id, person_id, project_id, hours, week_number, year, status')
    .eq('week_number', week)
    .eq('year', year)
    .in('status', ['submitted', 'approved'])

  // Get all-time entries for budget calc
  const { data: allEntries } = await supabase
    .from('time_entries')
    .select('id, person_id, project_id, hours, week_number, year, status')
    .in('status', ['submitted', 'approved'])

  // Get expenses for budget calc
  const { data: allExpenses } = await supabase
    .from('expenses')
    .select('project_id, amount, quantity')

  // Sum expenses per project
  const expensesByProject = new Map<string, number>()
  for (const exp of allExpenses || []) {
    const total = Number(exp.amount) * Number(exp.quantity)
    expensesByProject.set(exp.project_id, (expensesByProject.get(exp.project_id) ?? 0) + total)
  }

  // Fetch rates and overrides separately
  const entryPersonIds = Array.from(new Set([
    ...(weekEntries || []).map(e => e.person_id),
    ...(allEntries || []).map(e => e.person_id),
  ]))
  const { data: rateProfiles } = entryPersonIds.length > 0
    ? await supabase.from('profiles').select('id, name, internal_rate').in('id', entryPersonIds)
    : { data: [] }
  const rateProfileMap = new Map((rateProfiles || []).map(p => [p.id, p]))

  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('person_id, project_id, internal_rate_override')

  // Build assignment map keyed by "person_id:project_id"
  const assignmentMap = new Map(
    (assignments || []).map(a => [`${a.person_id}:${a.project_id}`, a])
  )

  const effectiveRate = (personId: string, projectId: string) => {
    const a = assignmentMap.get(`${personId}:${projectId}`)
    return Number(a?.internal_rate_override ?? rateProfileMap.get(personId)?.internal_rate ?? 0)
  }

  // Calculate metrics per project
  const projectMetrics = (projects || []).map(project => {
    const thisWeekProjectEntries = (weekEntries || []).filter(e => e.project_id === project.id)
    const allProjectEntries = (allEntries || []).filter(e => e.project_id === project.id)

    const thisWeekHours = thisWeekProjectEntries.reduce((sum, e) => sum + Number(e.hours), 0)
    const totalHours = allProjectEntries.reduce((sum, e) => sum + Number(e.hours), 0)

    const thisWeekCost = thisWeekProjectEntries.reduce((sum, e) =>
      sum + (Number(e.hours) * effectiveRate(e.person_id, e.project_id)), 0)

    const totalCost = allProjectEntries.reduce((sum, e) =>
      sum + (Number(e.hours) * effectiveRate(e.person_id, e.project_id)), 0)

    const totalExpenses = expensesByProject.get(project.id) ?? 0
    const actualCost = totalCost + totalExpenses

    let budgetRemaining: number | null = null
    let budgetPct: number | null = null
    if (project.budget_value) {
      if (project.budget_type === 'hours') {
        budgetRemaining = project.budget_value - totalHours
        budgetPct = (totalHours / project.budget_value) * 100
      } else if (project.budget_type === 'dollars') {
        budgetRemaining = project.budget_value - actualCost
        budgetPct = (actualCost / project.budget_value) * 100
      }
    }

    return {
      ...project,
      thisWeekHours,
      thisWeekCost,
      totalHours,
      totalCost: actualCost,
      budgetRemaining,
      budgetPct,
    }
  })

  const activeProjects = projectMetrics.filter(p => p.status === 'active')
  const totalWeekHours = activeProjects.reduce((sum, p) => sum + p.thisWeekHours, 0)
  const totalWeekCost = activeProjects.reduce((sum, p) => sum + p.thisWeekCost, 0)

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

    <div className="p-8">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Active Projects</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">{activeProjects.length}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">This Week Hours</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">{formatHours(totalWeekHours)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-[4px] p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">This Week Cost</p>
          <p className="text-2xl font-mono font-semibold text-neutral-900">{formatCurrency(totalWeekCost)}</p>
        </div>
      </div>

      {/* Projects table */}
      <div className="bg-white border border-neutral-200 rounded-[4px]">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-900">Active Projects</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Wk Hrs</TableHead>
              <TableHead className="text-right">Wk Cost</TableHead>
              <TableHead className="text-right">Total Hrs</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">Budget</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectMetrics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-neutral-500 py-8">
                  No projects yet. <Link href="/projects" className="text-amber-600 hover:underline">Create one</Link>
                </TableCell>
              </TableRow>
            ) : (
              projectMetrics.map(project => {
                const isNearBudget = project.budgetPct !== null && project.budgetPct >= 80
                const isOverBudget = project.budgetPct !== null && project.budgetPct >= 100
                return (
                  <TableRow key={project.id} className={isOverBudget ? 'bg-red-50' : isNearBudget ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-neutral-900 hover:text-amber-600 transition-colors"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-neutral-600">{project.client}</TableCell>
                    <TableCell>
                      <StatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-neutral-700">
                      {project.thisWeekHours > 0 ? formatHours(project.thisWeekHours) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-neutral-700">
                      {project.thisWeekCost > 0 ? formatCurrency(project.thisWeekCost) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-neutral-700">
                      {project.totalHours > 0 ? formatHours(project.totalHours) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-neutral-700">
                      {project.totalCost > 0 ? formatCurrency(project.totalCost) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {project.budget_value ? (
                        <span className={`font-mono text-sm ${isOverBudget ? 'text-red-600 font-semibold' : isNearBudget ? 'text-amber-600 font-semibold' : 'text-neutral-700'}`}>
                          {project.budget_type === 'hours'
                            ? `${formatHours(project.budgetRemaining ?? 0)} left`
                            : `${formatCurrency(project.budgetRemaining ?? 0)} left`}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-sm">No budget</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
    </>
  )
}
