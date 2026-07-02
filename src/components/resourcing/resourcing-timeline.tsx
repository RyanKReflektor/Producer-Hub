'use client'

import { useState, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarOff, Download, Trash2, UserPlus, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createAllocation,
  updateAllocation,
  deleteAllocation,
  createTimeOff,
  deleteTimeOff,
  createResourcePerson,
  deleteResourcePerson,
  createMilestone,
  deleteMilestone,
  type OwnerRef,
} from '@/app/(producer)/resourcing/actions'
import type {
  Profile, Project, ResourceAllocation, TimeOff, TimeOffType,
  ResourcePerson, ResourcePersonKind, Milestone,
} from '@/lib/types'

// ── Layout constants ────────────────────────────────────────────────────────
const LABEL_W = 224
const COL_W = 128
const DAY_W = COL_W / 7
const WEEKS = 12
const BAR_H = 24
const LANE_GAP = 4
const TOTALS_H = 22
const ROW_PAD = 10
const MILESTONE_H = 30

const PALETTE = ['#3E0BE5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

const TIME_OFF_LABELS: Record<TimeOffType, string> = {
  vacation: 'Vacation', holiday: 'Holiday', sick: 'Sick', other: 'Time Off',
}

// ── Date helpers (local, ISO 'YYYY-MM-DD') ───────────────────────────────────
function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function mondayOf(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay() || 7
  r.setDate(r.getDate() - (day - 1)); r.setHours(0, 0, 0, 0)
  return r
}
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000) }

// A unified row in the timeline — a real person (profile) or a placeholder/vendor.
interface Row {
  key: string
  kind: 'profile' | 'resource'
  id: string
  name: string
  subtitle: string
  color: string
  dailyHours: number
  deletable: boolean
}

function ownerKey(a: { person_id: string | null; resource_person_id: string | null }): string {
  return a.person_id ? `p:${a.person_id}` : `r:${a.resource_person_id}`
}
function parseOwner(key: string): OwnerRef {
  const [kind, id] = [key.slice(0, 1), key.slice(2)]
  return kind === 'p' ? { personId: id, resourcePersonId: null } : { personId: null, resourcePersonId: id }
}

interface Props {
  people: Profile[]
  projects: Project[]
  resourcePeople: ResourcePerson[]
  initialAllocations: ResourceAllocation[]
  initialTimeOff: TimeOff[]
  initialMilestones: Milestone[]
}

export function ResourcingTimeline({
  people, projects, resourcePeople: initialResourcePeople,
  initialAllocations, initialTimeOff, initialMilestones,
}: Props) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [allocations, setAllocations] = useState<ResourceAllocation[]>(initialAllocations)
  const [timeOff, setTimeOff] = useState<TimeOff[]>(initialTimeOff)
  const [resourcePeople, setResourcePeople] = useState<ResourcePerson[]>(initialResourcePeople)
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)
  const [nameFilter, setNameFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'employee' | 'freelancer' | 'placeholder' | 'vendor'>('all')

  const [allocDialog, setAllocDialog] = useState<{ open: boolean; edit: ResourceAllocation | null }>({ open: false, edit: null })
  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [personOpen, setPersonOpen] = useState(false)
  const [milestoneOpen, setMilestoneOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const projectMap = useMemo(() => new Map(projects.map((p, i) => [p.id, { project: p, idx: i }])), [projects])
  function projColor(projectId: string): string {
    const e = projectMap.get(projectId)
    return e?.project.color || PALETTE[(e?.idx ?? 0) % PALETTE.length]
  }

  // Unified, filtered rows
  const rows: Row[] = useMemo(() => {
    const profileRows: Row[] = people.map((p, i) => ({
      key: `p:${p.id}`, kind: 'profile', id: p.id, name: p.name,
      subtitle: p.person_type ?? '—', color: p.color || PALETTE[i % PALETTE.length],
      dailyHours: Number(p.daily_hours ?? 8), deletable: false,
    }))
    const resourceRows: Row[] = resourcePeople.map((r, i) => ({
      key: `r:${r.id}`, kind: 'resource', id: r.id, name: r.name,
      subtitle: r.kind === 'vendor' ? 'Vendor' : 'Placeholder',
      color: r.color || PALETTE[(people.length + i) % PALETTE.length],
      dailyHours: Number(r.daily_hours ?? 8), deletable: true,
    }))
    return [...profileRows, ...resourceRows].filter(row => {
      if (typeFilter !== 'all') {
        if (typeFilter === 'placeholder' || typeFilter === 'vendor') {
          const rp = resourcePeople.find(r => r.id === row.id && row.kind === 'resource')
          if (!rp || rp.kind !== typeFilter) return false
        } else {
          const pr = people.find(p => p.id === row.id && row.kind === 'profile')
          if (!pr || pr.person_type !== typeFilter) return false
        }
      }
      if (nameFilter && !row.name.toLowerCase().includes(nameFilter.toLowerCase())) return false
      return true
    })
  }, [people, resourcePeople, nameFilter, typeFilter])

  const weeks = useMemo(() => Array.from({ length: WEEKS }, (_, i) => addDays(weekStart, i * 7)), [weekStart])
  const rangeStart = weeks[0]
  const rangeEnd = addDays(weekStart, WEEKS * 7 - 1)
  const totalDays = WEEKS * 7
  const gridW = totalDays * DAY_W
  const todayMon = mondayOf(today).getTime()

  function rowAllocations(row: Row) {
    return allocations
      .filter(a => ownerKey(a) === row.key)
      .filter(a => parseISO(a.end_date) >= rangeStart && parseISO(a.start_date) <= rangeEnd)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  }
  function rowTimeOff(row: Row) {
    return timeOff
      .filter(t => ownerKey(t) === row.key)
      .filter(t => parseISO(t.end_date) >= rangeStart && parseISO(t.start_date) <= rangeEnd)
  }

  function assignLanes(items: ResourceAllocation[]): Map<string, number> {
    const laneEnds: Date[] = []
    const laneOf = new Map<string, number>()
    for (const a of items) {
      const s = parseISO(a.start_date)
      const e = parseISO(a.end_date)
      let lane = laneEnds.findIndex(end => s > end)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e) }
      else laneEnds[lane] = e
      laneOf.set(a.id, lane)
    }
    return laneOf
  }

  function weeklyTotals(row: Row): number[] {
    const allocs = allocations.filter(a => ownerKey(a) === row.key)
    return weeks.map(wkMonday => {
      const wkEnd = addDays(wkMonday, 6)
      let total = 0
      for (const a of allocs) {
        const from = parseISO(a.start_date) > wkMonday ? parseISO(a.start_date) : wkMonday
        const to = parseISO(a.end_date) < wkEnd ? parseISO(a.end_date) : wkEnd
        for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
          const dow = d.getDay()
          if (dow >= 1 && dow <= 5) total += Number(a.hours_per_day)
        }
      }
      return total
    })
  }

  function barGeometry(startStr: string, endStr: string) {
    const startDay = Math.max(0, daysBetween(rangeStart, parseISO(startStr)))
    const endDay = Math.min(totalDays - 1, daysBetween(rangeStart, parseISO(endStr)))
    const left = startDay * DAY_W
    const width = Math.max(DAY_W, (endDay - startDay + 1) * DAY_W)
    return { left, width }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleAllocSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const owner = parseOwner(fd.get('owner') as string)
    const projectId = fd.get('project_id') as string
    const startDate = fd.get('start_date') as string
    const endDate = fd.get('end_date') as string
    const hoursPerDay = Number(fd.get('hours_per_day'))
    const note = (fd.get('note') as string) ?? ''
    if (endDate < startDate) { setError('End date must be on or after start date.'); return }
    setSaving(true); setError(null)
    try {
      if (allocDialog.edit) {
        await updateAllocation(allocDialog.edit.id, owner, projectId, startDate, endDate, hoursPerDay, note)
        setAllocations(prev => prev.map(a => a.id === allocDialog.edit!.id
          ? { ...a, person_id: owner.personId, resource_person_id: owner.resourcePersonId, project_id: projectId, start_date: startDate, end_date: endDate, hours_per_day: hoursPerDay, note: note || null }
          : a))
      } else {
        const created = await createAllocation(owner, projectId, startDate, endDate, hoursPerDay, note)
        setAllocations(prev => [...prev, created])
      }
      setAllocDialog({ open: false, edit: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally { setSaving(false) }
  }

  async function handleDeleteAlloc(id: string) {
    await deleteAllocation(id)
    setAllocations(prev => prev.filter(a => a.id !== id))
    setAllocDialog({ open: false, edit: null })
  }

  async function handleTimeOffSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const owner = parseOwner(fd.get('owner') as string)
    const startDate = fd.get('start_date') as string
    const endDate = fd.get('end_date') as string
    const type = fd.get('type') as TimeOffType
    const note = (fd.get('note') as string) ?? ''
    if (endDate < startDate) { setError('End date must be on or after start date.'); return }
    setSaving(true); setError(null)
    try {
      const created = await createTimeOff(owner, startDate, endDate, type, note)
      setTimeOff(prev => [...prev, created])
      setTimeOffOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally { setSaving(false) }
  }

  async function handleDeleteTimeOff(id: string) {
    await deleteTimeOff(id)
    setTimeOff(prev => prev.filter(t => t.id !== id))
  }

  async function handlePersonSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = fd.get('name') as string
    const kind = fd.get('kind') as ResourcePersonKind
    const color = fd.get('color') as string
    const dailyHours = Number(fd.get('daily_hours'))
    setSaving(true); setError(null)
    try {
      const created = await createResourcePerson(name, kind, color, dailyHours)
      setResourcePeople(prev => [...prev, created])
      setPersonOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally { setSaving(false) }
  }

  async function handleDeletePerson(id: string) {
    await deleteResourcePerson(id)
    setResourcePeople(prev => prev.filter(r => r.id !== id))
    setAllocations(prev => prev.filter(a => a.resource_person_id !== id))
    setTimeOff(prev => prev.filter(t => t.resource_person_id !== id))
  }

  async function handleMilestoneSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const projectId = fd.get('project_id') as string
    const date = fd.get('date') as string
    const name = fd.get('name') as string
    setSaving(true); setError(null)
    try {
      const created = await createMilestone(projectId, date, name)
      setMilestones(prev => [...prev, created])
      setMilestoneOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally { setSaving(false) }
  }

  async function handleDeleteMilestone(id: string) {
    await deleteMilestone(id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  function exportCSV() {
    const rowsCsv: string[][] = [['Person', 'Project', 'Start', 'End', 'Hours/Day', 'Note']]
    const nameFor = (a: ResourceAllocation) =>
      a.person_id ? (people.find(p => p.id === a.person_id)?.name ?? '')
        : (resourcePeople.find(r => r.id === a.resource_person_id)?.name ?? '')
    for (const a of allocations) {
      rowsCsv.push([
        nameFor(a), projects.find(p => p.id === a.project_id)?.name ?? '',
        a.start_date, a.end_date, String(a.hours_per_day), a.note ?? '',
      ])
    }
    const csv = rowsCsv.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'resourcing.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const visibleMilestones = milestones
    .map(m => ({ m, day: daysBetween(rangeStart, parseISO(m.date)) }))
    .filter(({ day }) => day >= 0 && day < totalDays)

  const rangeLabel = `${rangeStart.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // People options grouped for the owner selects
  const ownerOptions = (
    <>
      <optgroup label="Team">
        {people.map(p => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
      </optgroup>
      {resourcePeople.length > 0 && (
        <optgroup label="Placeholders & Vendors">
          {resourcePeople.map(r => <option key={r.id} value={`r:${r.id}`}>{r.name}</option>)}
        </optgroup>
      )}
    </>
  )

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(addDays(weekStart, -28)))}><ChevronLeft size={15} /></Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(addDays(weekStart, 28)))}><ChevronRight size={15} /></Button>
        </div>
        <span className="text-sm text-neutral-500 font-mono ml-1">{rangeLabel}</span>
        <div className="flex-1" />
        <input type="text" placeholder="Filter by name…" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          className="h-8 text-sm border border-neutral-200 rounded-[4px] px-3 focus:outline-none focus:ring-1 focus:ring-neutral-900 w-36" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
          className="h-8 text-sm border border-neutral-200 rounded-[4px] px-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white">
          <option value="all">All Types</option>
          <option value="employee">Employees</option>
          <option value="freelancer">Freelancers</option>
          <option value="placeholder">Placeholders</option>
          <option value="vendor">Vendors</option>
        </select>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportCSV}><Download size={13} /> CSV</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setPersonOpen(true) }}><UserPlus size={13} /> Person</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setMilestoneOpen(true) }}><Flag size={13} /> Milestone</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setTimeOffOpen(true) }}><CalendarOff size={13} /> Time Off</Button>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setAllocDialog({ open: true, edit: null }) }}><Plus size={14} /> Assignment</Button>
      </div>

      {/* Timeline grid */}
      <div className="bg-white border border-neutral-200 rounded-[4px] overflow-hidden">
        <div ref={scrollRef} className="overflow-x-auto">
          <div style={{ minWidth: LABEL_W + gridW }}>
            {/* Header */}
            <div className="flex border-b border-neutral-200 bg-neutral-50">
              <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-200" />
              {weeks.map((wk, i) => (
                <div key={i} style={{ width: COL_W }}
                  className={`shrink-0 px-2 py-2 text-center border-r border-neutral-100 ${todayMon === wk.getTime() ? 'bg-purple-50' : ''}`}>
                  <div className="text-xs font-medium text-neutral-700">{wk.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</div>
                </div>
              ))}
            </div>

            {/* Milestones strip */}
            <div className="flex border-b border-neutral-200 bg-neutral-50/60">
              <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-200 px-3 flex items-center">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Milestones</span>
              </div>
              <div className="relative" style={{ width: gridW, height: MILESTONE_H }}>
                {weeks.map((wk, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-r border-neutral-100" style={{ left: i * COL_W, width: COL_W }} />
                ))}
                {visibleMilestones.map(({ m, day }) => (
                  <div key={m.id} className="absolute group -translate-x-1/2 flex flex-col items-center" style={{ left: day * DAY_W + DAY_W / 2, top: 4 }}
                    title={`${projects.find(p => p.id === m.project_id)?.name ?? ''} — ${m.name} (${m.date})`}>
                    <Flag size={13} style={{ color: projColor(m.project_id) }} className="fill-current" />
                    <button onClick={() => handleDeleteMilestone(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-[9px] text-neutral-400 hover:text-red-600 leading-none mt-0.5">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Person rows */}
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-neutral-400">No people match this filter.</div>
            ) : (
              rows.map(row => {
                const allocs = rowAllocations(row)
                const laneOf = assignLanes(allocs)
                const laneCount = Math.max(1, ...Array.from(laneOf.values()).map(l => l + 1))
                const tos = rowTimeOff(row)
                const totals = weeklyTotals(row)
                const capacity = row.dailyHours * 5
                const barsH = laneCount * BAR_H + (laneCount - 1) * LANE_GAP
                const rowH = ROW_PAD * 2 + barsH + TOTALS_H

                return (
                  <div key={row.key} className="flex border-b border-neutral-100 last:border-0">
                    {/* Label */}
                    <div style={{ width: LABEL_W, minHeight: rowH }} className="shrink-0 border-r border-neutral-200 px-3 py-2.5 flex items-center gap-2.5 group">
                      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: row.color }}>
                        {row.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{row.name}</p>
                        <p className="text-xs text-neutral-400 capitalize">{row.subtitle}</p>
                      </div>
                      {row.deletable && (
                        <button onClick={() => handleDeletePerson(row.id)} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-red-600 shrink-0" title="Remove person">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* Track */}
                    <div className="relative" style={{ width: gridW, height: rowH }}>
                      {weeks.map((wk, i) => {
                        const over = totals[i] > capacity
                        return (
                          <div key={i}
                            className={`absolute top-0 bottom-0 border-r border-neutral-100 ${todayMon === wk.getTime() ? 'bg-purple-50/40' : ''} ${over ? 'bg-red-50/60' : ''}`}
                            style={{ left: i * COL_W, width: COL_W }} />
                        )
                      })}

                      {/* Time off */}
                      {tos.map(to => {
                        const { left, width } = barGeometry(to.start_date, to.end_date)
                        return (
                          <div key={to.id} className="absolute rounded-[3px] flex items-center px-2 group/to"
                            style={{ left, width, top: ROW_PAD, height: barsH, backgroundColor: '#f1f5f9',
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(100,116,139,0.12) 5px, rgba(100,116,139,0.12) 10px)',
                              border: '1px solid #e2e8f0' }}
                            title={`${TIME_OFF_LABELS[to.type]} · ${to.start_date} → ${to.end_date}`}>
                            <span className="text-[11px] font-medium text-neutral-500 truncate">{TIME_OFF_LABELS[to.type]}</span>
                            <button onClick={() => handleDeleteTimeOff(to.id)} className="opacity-0 group-hover/to:opacity-100 ml-auto text-neutral-400 hover:text-red-600"><Trash2 size={12} /></button>
                          </div>
                        )
                      })}

                      {/* Allocation bars */}
                      {allocs.map(a => {
                        const { left, width } = barGeometry(a.start_date, a.end_date)
                        const lane = laneOf.get(a.id) ?? 0
                        return (
                          <button key={a.id} onClick={() => { setError(null); setAllocDialog({ open: true, edit: a }) }}
                            className="absolute rounded-[4px] flex items-center px-2 text-left hover:brightness-110 transition-all"
                            style={{ left, width, top: ROW_PAD + lane * (BAR_H + LANE_GAP), height: BAR_H, backgroundColor: projColor(a.project_id) }}
                            title={`${projectMap.get(a.project_id)?.project.name ?? 'Project'} · ${a.hours_per_day}h/day · ${a.start_date} → ${a.end_date}`}>
                            <span className="text-[11px] font-medium text-white truncate">
                              {projectMap.get(a.project_id)?.project.name ?? 'Project'} ({a.hours_per_day}h)
                            </span>
                          </button>
                        )
                      })}

                      {/* Weekly totals */}
                      {totals.map((t, i) => (
                        <div key={i} className={`absolute text-center text-[11px] font-mono ${t > capacity ? 'text-red-600 font-semibold' : 'text-neutral-400'}`}
                          style={{ left: i * COL_W, width: COL_W, bottom: 4 }}
                          title={t > capacity ? `Over capacity (${capacity}h/wk)` : undefined}>
                          {t > 0 ? `${t}h` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Assignment dialog */}
      <Dialog open={allocDialog.open} onOpenChange={v => { if (!v) setAllocDialog({ open: false, edit: null }) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{allocDialog.edit ? 'Edit assignment' : 'New assignment'}</DialogTitle></DialogHeader>
          <form onSubmit={handleAllocSubmit} className="space-y-3 pt-1">
            <Field label="Person">
              <select name="owner" defaultValue={allocDialog.edit ? ownerKey(allocDialog.edit) : ''} required className={selectCls}>
                <option value="" disabled>Select person…</option>
                {ownerOptions}
              </select>
            </Field>
            <Field label="Project">
              <select name="project_id" defaultValue={allocDialog.edit?.project_id ?? ''} required className={selectCls}>
                <option value="" disabled>Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><input name="start_date" type="date" defaultValue={allocDialog.edit?.start_date ?? toISO(today)} required className={inputCls} /></Field>
              <Field label="End date"><input name="end_date" type="date" defaultValue={allocDialog.edit?.end_date ?? toISO(addDays(today, 4))} required className={inputCls} /></Field>
            </div>
            <Field label="Hours per day"><input name="hours_per_day" type="number" min="0" max="24" step="0.5" defaultValue={allocDialog.edit?.hours_per_day ?? 8} required className={inputCls} /></Field>
            <Field label="Note (optional)"><input name="note" type="text" defaultValue={allocDialog.edit?.note ?? ''} className={inputCls} /></Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center justify-between pt-1">
              {allocDialog.edit ? (
                <Button type="button" variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => handleDeleteAlloc(allocDialog.edit!.id)}><Trash2 size={13} /> Delete</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAllocDialog({ open: false, edit: null })}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Time off dialog */}
      <Dialog open={timeOffOpen} onOpenChange={v => { if (!v) setTimeOffOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log time off</DialogTitle></DialogHeader>
          <form onSubmit={handleTimeOffSubmit} className="space-y-3 pt-1">
            <Field label="Person">
              <select name="owner" defaultValue="" required className={selectCls}>
                <option value="" disabled>Select person…</option>
                {ownerOptions}
              </select>
            </Field>
            <Field label="Type">
              <select name="type" defaultValue="vacation" required className={selectCls}>
                <option value="vacation">Vacation</option><option value="holiday">Holiday</option>
                <option value="sick">Sick</option><option value="other">Other</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><input name="start_date" type="date" defaultValue={toISO(today)} required className={inputCls} /></Field>
              <Field label="End date"><input name="end_date" type="date" defaultValue={toISO(today)} required className={inputCls} /></Field>
            </div>
            <Field label="Note (optional)"><input name="note" type="text" className={inputCls} /></Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setTimeOffOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Resource person dialog */}
      <Dialog open={personOpen} onOpenChange={v => { if (!v) setPersonOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add placeholder / vendor</DialogTitle></DialogHeader>
          <form onSubmit={handlePersonSubmit} className="space-y-3 pt-1">
            <Field label="Name"><input name="name" type="text" required placeholder="e.g. Motion Designer (TBD), Acme Studio" className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select name="kind" defaultValue="placeholder" required className={selectCls}>
                  <option value="placeholder">Placeholder (unfilled role)</option>
                  <option value="vendor">Vendor (external)</option>
                </select>
              </Field>
              <Field label="Daily hours"><input name="daily_hours" type="number" min="0" max="24" step="0.5" defaultValue={8} required className={inputCls} /></Field>
            </div>
            <Field label="Colour"><input name="color" type="color" defaultValue="#3E0BE5" className="h-9 w-16 border border-neutral-200 rounded-[4px] p-1 cursor-pointer" /></Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setPersonOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Milestone dialog */}
      <Dialog open={milestoneOpen} onOpenChange={v => { if (!v) setMilestoneOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add milestone</DialogTitle></DialogHeader>
          <form onSubmit={handleMilestoneSubmit} className="space-y-3 pt-1">
            <Field label="Project">
              <select name="project_id" defaultValue="" required className={selectCls}>
                <option value="" disabled>Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Label"><input name="name" type="text" required placeholder="e.g. Final delivery, Client review" className={inputCls} /></Field>
            <Field label="Date"><input name="date" type="date" defaultValue={toISO(today)} required className={inputCls} /></Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setMilestoneOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const inputCls = 'w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900'
const selectCls = inputCls + ' bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
