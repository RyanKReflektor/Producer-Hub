'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
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
const BAR_H = 24
const LANE_GAP = 4
const TOTALS_H = 22
const ROW_PAD = 10
const MILESTONE_H = 30
const HANDLE_W = 7
const DRAG_THRESHOLD = 3

// `minDayW` is a floor for small screens; the actual day width scales up to
// fill the available container width (see DAY_W below).
const ZOOMS = [
  { label: '2 weeks', days: 14, minDayW: 40 },
  { label: 'Month', days: 35, minDayW: 20 },
  { label: '3 months', days: 91, minDayW: 9 },
  { label: '6 months', days: 182, minDayW: 5 },
]

const PALETTE = ['#3E0BE5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

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
function addISO(iso: string, n: number): string { return toISO(addDays(parseISO(iso), n)) }
function mondayOf(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay() || 7
  r.setDate(r.getDate() - (day - 1)); r.setHours(0, 0, 0, 0)
  return r
}
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function workingDaysBetween(startISO: string, endISO: string): number {
  let n = 0
  for (let d = parseISO(startISO); d <= parseISO(endISO); d = addDays(d, 1)) {
    const w = d.getDay()
    if (w >= 1 && w <= 5) n++
  }
  return n
}

interface Row {
  key: string
  groupKind: 'person' | 'project'
  id: string             // person id (profile/resource) or project id
  ownerKey?: string      // person rows only: 'p:id' / 'r:id'
  name: string
  subtitle: string
  color: string
  capacity: number       // hours/week ceiling for over-allocation; Infinity for projects
  deletable: boolean
}

function ownerKey(a: { person_id: string | null; resource_person_id: string | null }): string {
  return a.person_id ? `p:${a.person_id}` : `r:${a.resource_person_id}`
}
function parseOwner(key: string): OwnerRef {
  const [kind, id] = [key.slice(0, 1), key.slice(2)]
  return kind === 'p' ? { personId: id, resourcePersonId: null } : { personId: null, resourcePersonId: id }
}

// Live drag bookkeeping (held in a ref so window listeners see fresh values).
// `cur*` fields are updated on every move so pointer-up reads the final value
// without hitting a stale React state closure.
type Drag =
  | { mode: 'move' | 'left' | 'right'; id: string; startX: number; origStart: string; origEnd: string; moved: boolean; curStart?: string; curEnd?: string }
  | { mode: 'create'; rowKey: string; trackLeft: number; startDay: number; moved: boolean; curStartDay?: number; curEndDay?: number }

// Preview positions rendered mid-drag
interface Preview {
  id?: string
  start_date?: string
  end_date?: string
  createRowKey?: string
  createStartDay?: number
  createEndDay?: number
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
  const [zoomIdx, setZoomIdx] = useState(2)
  const [allocations, setAllocations] = useState<ResourceAllocation[]>(initialAllocations)
  const [timeOff, setTimeOff] = useState<TimeOff[]>(initialTimeOff)
  const [resourcePeople, setResourcePeople] = useState<ResourcePerson[]>(initialResourcePeople)
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)
  const [nameFilter, setNameFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'employee' | 'freelancer' | 'placeholder' | 'vendor'>('all')
  const [groupBy, setGroupBy] = useState<'people' | 'projects'>('people')

  const [allocDialog, setAllocDialog] = useState<{ open: boolean; edit: ResourceAllocation | null; prefill?: { owner?: string; projectId?: string; start: string; end: string } }>({ open: false, edit: null })
  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [personOpen, setPersonOpen] = useState(false)
  const [milestoneOpen, setMilestoneOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dragRef = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  // Measure the timeline container so the day width can scale to fill it.
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(1200)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width)
    })
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const zoom = ZOOMS[zoomIdx]
  const totalDays = zoom.days
  // Fill the available width; fall back to the per-zoom minimum on small screens.
  const availableW = Math.max(280, containerW - LABEL_W)
  const DAY_W = Math.max(zoom.minDayW, availableW / totalDays)
  const COL_W = DAY_W * 7
  const showDayLabels = DAY_W >= 20
  const gridW = totalDays * DAY_W

  const projectMap = useMemo(() => new Map(projects.map((p, i) => [p.id, { project: p, idx: i }])), [projects])
  function projColor(projectId: string): string {
    const e = projectMap.get(projectId)
    return e?.project.color || PALETTE[(e?.idx ?? 0) % PALETTE.length]
  }

  // Owner-key → display name + colour, for bars shown in project view.
  const personDisplay = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>()
    people.forEach((p, i) => m.set(`p:${p.id}`, { name: p.name, color: p.color || PALETTE[i % PALETTE.length] }))
    resourcePeople.forEach((r, i) => m.set(`r:${r.id}`, { name: r.name, color: r.color || PALETTE[(people.length + i) % PALETTE.length] }))
    return m
  }, [people, resourcePeople])

  const rows: Row[] = useMemo(() => {
    const q = nameFilter.toLowerCase()
    if (groupBy === 'projects') {
      return projects
        .map<Row>(p => ({
          key: `proj:${p.id}`, groupKind: 'project', id: p.id,
          name: p.name, subtitle: p.client, color: projColor(p.id),
          capacity: Infinity, deletable: false,
        }))
        .filter(row => !q || row.name.toLowerCase().includes(q))
    }
    const profileRows: Row[] = people.map((p, i) => ({
      key: `p:${p.id}`, groupKind: 'person', id: p.id, ownerKey: `p:${p.id}`, name: p.name,
      subtitle: p.person_type ?? '—', color: p.color || PALETTE[i % PALETTE.length],
      capacity: Number(p.daily_hours ?? 8) * 5, deletable: false,
    }))
    const resourceRows: Row[] = resourcePeople.map((r, i) => ({
      key: `r:${r.id}`, groupKind: 'person', id: r.id, ownerKey: `r:${r.id}`, name: r.name,
      subtitle: r.kind === 'vendor' ? 'Vendor' : 'Placeholder',
      color: r.color || PALETTE[(people.length + i) % PALETTE.length],
      capacity: Number(r.daily_hours ?? 8) * 5, deletable: true,
    }))
    return [...profileRows, ...resourceRows].filter(row => {
      if (typeFilter !== 'all') {
        if (typeFilter === 'placeholder' || typeFilter === 'vendor') {
          const rp = resourcePeople.find(r => r.id === row.id)
          if (!rp || rp.kind !== typeFilter) return false
        } else {
          const pr = people.find(p => p.id === row.id)
          if (!pr || pr.person_type !== typeFilter) return false
        }
      }
      if (q && !row.name.toLowerCase().includes(q)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, resourcePeople, projects, nameFilter, typeFilter, groupBy])

  const rangeStart = useMemo(() => mondayOf(weekStart), [weekStart])
  const weeks = useMemo(() => Array.from({ length: totalDays / 7 }, (_, i) => addDays(rangeStart, i * 7)), [rangeStart, totalDays])
  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i)), [rangeStart, totalDays])
  const rangeEnd = addDays(rangeStart, totalDays - 1)
  const todayMon = mondayOf(today).getTime()

  // Weekend stripes: transparent for Mon–Fri, subtle shade for Sat/Sun of each week
  const weekendBg = `repeating-linear-gradient(90deg, transparent 0px, transparent ${5 * DAY_W}px, rgba(15,23,42,0.045) ${5 * DAY_W}px, rgba(15,23,42,0.045) ${7 * DAY_W}px)`

  function allocInRow(a: ResourceAllocation, row: Row) {
    return row.groupKind === 'project' ? a.project_id === row.id : ownerKey(a) === row.ownerKey
  }
  function rowAllocations(row: Row) {
    return allocations
      .filter(a => allocInRow(a, row))
      .filter(a => parseISO(a.end_date) >= rangeStart && parseISO(a.start_date) <= rangeEnd)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  }
  function rowTimeOff(row: Row) {
    if (row.groupKind === 'project') return []  // time off is per person, not per project
    return timeOff
      .filter(t => ownerKey(t) === row.ownerKey)
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
    const allocs = allocations.filter(a => allocInRow(a, row))
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

  // ── Drag interactions ────────────────────────────────────────────────────
  function beginDrag(e: React.PointerEvent, drag: Drag) {
    e.preventDefault()
    dragRef.current = drag
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (d.mode === 'create') {
        const day = Math.max(0, Math.min(totalDays - 1, Math.floor((ev.clientX - d.trackLeft) / DAY_W)))
        if (day !== d.startDay) d.moved = true
        d.curStartDay = Math.min(d.startDay, day)
        d.curEndDay = Math.max(d.startDay, day)
        setPreview({ createRowKey: d.rowKey, createStartDay: d.curStartDay, createEndDay: d.curEndDay })
        return
      }
      const deltaDays = Math.round((ev.clientX - d.startX) / DAY_W)
      if (Math.abs(ev.clientX - d.startX) > DRAG_THRESHOLD) d.moved = true
      if (d.mode === 'move') {
        d.curStart = addISO(d.origStart, deltaDays)
        d.curEnd = addISO(d.origEnd, deltaDays)
      } else if (d.mode === 'left') {
        let ns = addISO(d.origStart, deltaDays)
        if (ns > d.origEnd) ns = d.origEnd
        d.curStart = ns; d.curEnd = d.origEnd
      } else {
        let ne = addISO(d.origEnd, deltaDays)
        if (ne < d.origStart) ne = d.origStart
        d.curStart = d.origStart; d.curEnd = ne
      }
      setPreview({ id: d.id, start_date: d.curStart, end_date: d.curEnd })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      const d = dragRef.current
      dragRef.current = null
      setPreview(null)
      if (!d) return

      if (d.mode === 'create') {
        const startDay = d.curStartDay ?? d.startDay
        const endDay = d.curEndDay ?? d.startDay
        const start = toISO(addDays(rangeStart, startDay))
        const end = toISO(addDays(rangeStart, endDay))
        const prefill = d.rowKey.startsWith('proj:')
          ? { projectId: d.rowKey.slice(5), start, end }
          : { owner: d.rowKey, start, end }
        setAllocDialog({ open: true, edit: null, prefill })
        setError(null)
        return
      }

      const alloc = allocations.find(a => a.id === d.id)
      if (!alloc) return
      if (!d.moved) {
        setAllocDialog({ open: true, edit: alloc }); setError(null)
        return
      }
      const start = d.curStart ?? alloc.start_date
      const end = d.curEnd ?? alloc.end_date
      if (start === alloc.start_date && end === alloc.end_date) return
      commitDates(alloc, start, end)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  async function commitDates(alloc: ResourceAllocation, start: string, end: string) {
    setAllocations(prev => prev.map(a => a.id === alloc.id ? { ...a, start_date: start, end_date: end } : a))
    try {
      await updateAllocation(
        alloc.id,
        { personId: alloc.person_id, resourcePersonId: alloc.resource_person_id },
        alloc.project_id, start, end, alloc.hours_per_day, alloc.note ?? '',
      )
    } catch {
      setAllocations(prev => prev.map(a => a.id === alloc.id ? alloc : a))
    }
  }

  // ── Form handlers ──────────────────────────────────────────────────────────
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
    setSaving(true); setError(null)
    try {
      const created = await createResourcePerson(fd.get('name') as string, fd.get('kind') as ResourcePersonKind, fd.get('color') as string, Number(fd.get('daily_hours')))
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
    setSaving(true); setError(null)
    try {
      const created = await createMilestone(fd.get('project_id') as string, fd.get('date') as string, fd.get('name') as string)
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
    const rowsCsv: string[][] = [['Person', 'Project', 'Start', 'End', 'Hours/Day', 'Total Hours', 'Note']]
    const nameFor = (a: ResourceAllocation) =>
      a.person_id ? (people.find(p => p.id === a.person_id)?.name ?? '')
        : (resourcePeople.find(r => r.id === a.resource_person_id)?.name ?? '')
    for (const a of allocations) {
      const total = Number(a.hours_per_day) * workingDaysBetween(a.start_date, a.end_date)
      rowsCsv.push([nameFor(a), projects.find(p => p.id === a.project_id)?.name ?? '', a.start_date, a.end_date, String(a.hours_per_day), String(total), a.note ?? ''])
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
  const stepDays = Math.max(7, Math.floor(totalDays / 7 / 2) * 7)

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
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(addDays(rangeStart, -stepDays)))}><ChevronLeft size={15} /></Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(addDays(rangeStart, stepDays)))}><ChevronRight size={15} /></Button>
        </div>
        <select value={zoomIdx} onChange={e => setZoomIdx(Number(e.target.value))}
          className="h-8 text-sm border border-neutral-200 rounded-[4px] px-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white">
          {ZOOMS.map((z, i) => <option key={z.label} value={i}>{z.label}</option>)}
        </select>
        {/* Group by: view rows as people or as projects */}
        <div className="flex items-center border border-neutral-200 rounded-[4px] overflow-hidden h-8">
          <button type="button" onClick={() => setGroupBy('people')}
            className={`px-3 h-full text-xs font-medium ${groupBy === 'people' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}>People</button>
          <button type="button" onClick={() => setGroupBy('projects')}
            className={`px-3 h-full text-xs font-medium border-l border-neutral-200 ${groupBy === 'projects' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}>Projects</button>
        </div>
        <span className="text-sm text-neutral-500 font-mono ml-1">{rangeLabel}</span>
        <div className="flex-1" />
        <input type="text" placeholder="Filter by name…" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          className="h-8 text-sm border border-neutral-200 rounded-[4px] px-3 focus:outline-none focus:ring-1 focus:ring-neutral-900 w-36" />
        {groupBy === 'people' && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            className="h-8 text-sm border border-neutral-200 rounded-[4px] px-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white">
            <option value="all">All Types</option>
            <option value="employee">Employees</option>
            <option value="freelancer">Freelancers</option>
            <option value="placeholder">Placeholders</option>
            <option value="vendor">Vendors</option>
          </select>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportCSV}><Download size={13} /> CSV</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setPersonOpen(true) }}><UserPlus size={13} /> Person</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setMilestoneOpen(true) }}><Flag size={13} /> Milestone</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setTimeOffOpen(true) }}><CalendarOff size={13} /> Time Off</Button>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setAllocDialog({ open: true, edit: null }) }}><Plus size={14} /> Assignment</Button>
      </div>

      <p className="text-xs text-neutral-400 mb-2">Tip: drag an empty row to draw an assignment, drag a bar to move it, or grab either edge to resize.</p>

      {/* Timeline grid */}
      <div ref={containerRef} className="bg-white border border-neutral-200 rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: LABEL_W + gridW }}>
            {/* Week label row */}
            <div className="flex border-b border-neutral-200 bg-neutral-50">
              <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-200" />
              {weeks.map((wk, i) => (
                <div key={i} style={{ width: COL_W }}
                  className={`shrink-0 px-2 py-1.5 text-center border-r border-neutral-200 ${todayMon === wk.getTime() ? 'bg-purple-50' : ''}`}>
                  <div className="text-xs font-medium text-neutral-700">{wk.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</div>
                </div>
              ))}
            </div>

            {/* Day-of-week row (fine zoom only) */}
            {showDayLabels && (
              <div className="flex border-b border-neutral-200 bg-neutral-50/70">
                <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-200" />
                {days.map((d, i) => {
                  const wknd = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div key={i} style={{ width: DAY_W }}
                      className={`shrink-0 text-center py-1 border-r border-neutral-100 ${wknd ? 'bg-neutral-200/50' : ''}`}>
                      <div className="text-[10px] font-medium text-neutral-500 leading-none">{DOW[d.getDay()]}</div>
                      {DAY_W >= 40 && <div className="text-[10px] text-neutral-400 leading-tight mt-0.5">{d.getDate()}</div>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Milestones strip */}
            <div className="flex border-b border-neutral-200 bg-neutral-50/60">
              <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-200 px-3 flex items-center">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Milestones</span>
              </div>
              <div className="relative" style={{ width: gridW, height: MILESTONE_H, background: weekendBg }}>
                {weeks.map((wk, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-r border-neutral-200/70" style={{ left: i * COL_W, width: COL_W }} />
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
              <div className="px-4 py-10 text-center text-sm text-neutral-400">{groupBy === 'projects' ? 'No projects match this filter.' : 'No people match this filter.'}</div>
            ) : (
              rows.map(row => {
                const allocs = rowAllocations(row)
                const laneOf = assignLanes(allocs)
                const laneCount = Math.max(1, ...Array.from(laneOf.values()).map(l => l + 1))
                const tos = rowTimeOff(row)
                const totals = weeklyTotals(row)
                const capacity = row.capacity
                const barsH = laneCount * BAR_H + (laneCount - 1) * LANE_GAP  // occupied lanes
                // One always-empty lane below the bars, so there's always somewhere to drag-create.
                const emptyLaneTop = ROW_PAD + laneCount * (BAR_H + LANE_GAP)
                const rowH = ROW_PAD * 2 + (laneCount + 1) * BAR_H + laneCount * LANE_GAP + TOTALS_H
                const isCreatingHere = preview?.createRowKey === row.key

                return (
                  <div key={row.key} className="flex border-b border-neutral-100 last:border-0 group/row">
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

                    {/* Track (empty-area drag creates an assignment) */}
                    <div
                      className="relative cursor-crosshair"
                      style={{ width: gridW, height: rowH, background: weekendBg }}
                      onPointerDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const startDay = Math.max(0, Math.min(totalDays - 1, Math.floor((e.clientX - rect.left) / DAY_W)))
                        beginDrag(e, { mode: 'create', rowKey: row.key, trackLeft: rect.left, startDay, moved: false })
                      }}
                    >
                      {/* Week separators + today / over-capacity tint (decorative) */}
                      {weeks.map((wk, i) => {
                        const over = totals[i] > capacity
                        return (
                          <div key={i}
                            className={`absolute top-0 bottom-0 border-r border-neutral-200/70 pointer-events-none ${todayMon === wk.getTime() ? 'bg-purple-50/40' : ''} ${over ? 'bg-red-50/60' : ''}`}
                            style={{ left: i * COL_W, width: COL_W }} />
                        )
                      })}

                      {/* Always-empty lane: a drag target that's clear even when bars fill the row */}
                      {!isCreatingHere && (
                        <div className="absolute rounded-[4px] border border-dashed border-neutral-300 bg-neutral-50/40 pointer-events-none flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
                          style={{ left: 0, width: gridW, top: emptyLaneTop, height: BAR_H }}>
                          <span className="text-[10px] text-neutral-400">Drag to add an allocation</span>
                        </div>
                      )}

                      {/* Create preview ghost */}
                      {isCreatingHere && preview?.createStartDay != null && (
                        <div className="absolute rounded-[4px] border-2 border-dashed border-neutral-400 bg-neutral-200/40 pointer-events-none"
                          style={{ left: preview.createStartDay * DAY_W, width: (preview.createEndDay! - preview.createStartDay! + 1) * DAY_W, top: emptyLaneTop, height: BAR_H }} />
                      )}

                      {/* Time off */}
                      {tos.map(to => {
                        const { left, width } = barGeometry(to.start_date, to.end_date)
                        return (
                          <div key={to.id} className="absolute rounded-[3px] flex items-center px-2 group/to"
                            onPointerDown={e => e.stopPropagation()}
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
                        const eff = preview?.id === a.id
                          ? { start: preview.start_date!, end: preview.end_date! }
                          : { start: a.start_date, end: a.end_date }
                        const { left, width } = barGeometry(eff.start, eff.end)
                        const lane = laneOf.get(a.id) ?? 0
                        const hpd = Number(a.hours_per_day)
                        const total = hpd * workingDaysBetween(eff.start, eff.end)
                        // People view: bar = project. Project view: bar = person.
                        const owner = personDisplay.get(ownerKey(a))
                        const name = row.groupKind === 'project'
                          ? (owner?.name ?? 'Person')
                          : (projectMap.get(a.project_id)?.project.name ?? 'Project')
                        const barColor = row.groupKind === 'project'
                          ? (owner?.color ?? PALETTE[0])
                          : projColor(a.project_id)
                        return (
                          <div key={a.id}
                            onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { mode: 'move', id: a.id, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date, moved: false }) }}
                            className="absolute rounded-[4px] flex items-center text-left hover:brightness-110 transition-[filter] cursor-grab active:cursor-grabbing group/bar select-none"
                            style={{ left, width, top: ROW_PAD + lane * (BAR_H + LANE_GAP), height: BAR_H, backgroundColor: barColor }}
                            title={`${name} · ${hpd}h/day · ${total}h total · ${eff.start} → ${eff.end}`}>
                            {/* left resize handle */}
                            <div onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { mode: 'left', id: a.id, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date, moved: false }) }}
                              className="absolute left-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-black/20 rounded-l-[4px]" style={{ width: HANDLE_W }} />
                            <span className="text-[11px] font-medium text-white truncate px-2 pointer-events-none">
                              {name} · {hpd}h/d · {total}h
                            </span>
                            {/* right resize handle */}
                            <div onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { mode: 'right', id: a.id, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date, moved: false }) }}
                              className="absolute right-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-black/20 rounded-r-[4px]" style={{ width: HANDLE_W }} />
                          </div>
                        )
                      })}

                      {/* Weekly totals */}
                      {totals.map((t, i) => (
                        <div key={i} className={`absolute text-center text-[11px] font-mono pointer-events-none ${t > capacity ? 'text-red-600 font-semibold' : 'text-neutral-400'}`}
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
          <form key={allocDialog.edit?.id ?? allocDialog.prefill?.owner ?? allocDialog.prefill?.projectId ?? 'new'} onSubmit={handleAllocSubmit} className="space-y-3 pt-1">
            <Field label="Person">
              <select name="owner" defaultValue={allocDialog.edit ? ownerKey(allocDialog.edit) : (allocDialog.prefill?.owner ?? '')} required className={selectCls}>
                <option value="" disabled>Select person…</option>
                {ownerOptions}
              </select>
            </Field>
            <Field label="Project">
              <select name="project_id" defaultValue={allocDialog.edit?.project_id ?? allocDialog.prefill?.projectId ?? ''} required className={selectCls}>
                <option value="" disabled>Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><input name="start_date" type="date" defaultValue={allocDialog.edit?.start_date ?? allocDialog.prefill?.start ?? toISO(today)} required className={inputCls} /></Field>
              <Field label="End date"><input name="end_date" type="date" defaultValue={allocDialog.edit?.end_date ?? allocDialog.prefill?.end ?? toISO(addDays(today, 4))} required className={inputCls} /></Field>
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
