'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronsDownUp, Plus, CalendarOff,
  Download, Trash2, UserPlus, Flag, Pencil, Search, CalendarClock, FolderPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProjectForm } from '@/components/projects/project-form'
import { getISOWeek } from '@/lib/utils'
import {
  createAllocation, updateAllocation, deleteAllocation,
  createTimeOff, deleteTimeOff,
  createResourcePerson, updateResourcePerson, deleteResourcePerson,
  createMilestone, deleteMilestone, shiftTimeline,
  type OwnerRef,
} from '@/app/(producer)/resourcing/actions'
import type {
  Profile, Project, ResourceAllocation, TimeOff, TimeOffType,
  ResourcePerson, ResourcePersonKind, Milestone,
} from '@/lib/types'

// ── Layout constants ────────────────────────────────────────────────────────
const LABEL_W = 236
const BAR_H = 24
const LANE_GAP = 4
const ROW_PAD = 10
const HANDLE_W = 7
const DRAG_THRESHOLD = 3

const ZOOMS = [
  { label: '2 weeks', days: 14, minDayW: 40 },
  { label: 'Month', days: 35, minDayW: 20 },
  { label: '3 months', days: 91, minDayW: 9 },
  { label: '6 months', days: 182, minDayW: 5 },
]

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
function fmtH(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(1) }

interface Row {
  key: string
  groupKind: 'person' | 'project'
  id: string
  ownerKey?: string
  name: string
  subtitle: string
  tags: string[]
  color: string
  capacity: number       // hours/week; Infinity for projects
  deletable: boolean
  editable: boolean       // resource people can be edited/renamed
}

function parseTags(raw: string): string[] {
  return Array.from(new Set(raw.split(',').map(t => t.trim()).filter(Boolean)))
}

function ownerKey(a: { person_id: string | null; resource_person_id: string | null }): string {
  return a.person_id ? `p:${a.person_id}` : `r:${a.resource_person_id}`
}
function parseOwner(key: string): OwnerRef {
  const [kind, id] = [key.slice(0, 1), key.slice(2)]
  return kind === 'p' ? { personId: id, resourcePersonId: null } : { personId: null, resourcePersonId: id }
}

type Drag =
  | { mode: 'move' | 'left' | 'right'; id: string; startX: number; origStart: string; origEnd: string; moved: boolean; curStart?: string; curEnd?: string }
  | { mode: 'create'; rowKey: string; trackLeft: number; startDay: number; lane: number; prefillOwner?: string; prefillProjectId?: string; moved: boolean; curStartDay?: number; curEndDay?: number }

interface Preview {
  id?: string
  start_date?: string
  end_date?: string
  createRowKey?: string
  createStartDay?: number
  createEndDay?: number
  createLane?: number
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
  const [sortBy, setSortBy] = useState<'name' | 'role'>('name')
  const [groupBy, setGroupBy] = useState<'people' | 'projects'>('people')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [allocDialog, setAllocDialog] = useState<{ open: boolean; edit: ResourceAllocation | null; prefill?: { owner?: string; projectId?: string; start: string; end: string } }>({ open: false, edit: null })
  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [personDialog, setPersonDialog] = useState<{ open: boolean; edit: ResourcePerson | null }>({ open: false, edit: null })
  const [milestoneOpen, setMilestoneOpen] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dragRef = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(1200)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => { for (const e of entries) setContainerW(e.contentRect.width) })
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const zoom = ZOOMS[zoomIdx]
  const totalDays = zoom.days
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

  const personDisplay = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>()
    people.forEach((p, i) => m.set(`p:${p.id}`, { name: p.name, color: p.color || PALETTE[i % PALETTE.length] }))
    resourcePeople.forEach((r, i) => m.set(`r:${r.id}`, { name: r.name, color: r.color || PALETTE[(people.length + i) % PALETTE.length] }))
    return m
  }, [people, resourcePeople])

  const rows: Row[] = useMemo(() => {
    const q = nameFilter.toLowerCase()
    let list: Row[]
    const matches = (row: Row) =>
      !q || row.name.toLowerCase().includes(q) || row.subtitle.toLowerCase().includes(q) ||
      row.tags.some(t => t.toLowerCase().includes(q))
    if (groupBy === 'projects') {
      list = projects.map<Row>(p => ({
        key: `proj:${p.id}`, groupKind: 'project', id: p.id,
        name: p.name, subtitle: p.client, tags: [], color: projColor(p.id),
        capacity: Infinity, deletable: false, editable: false,
      })).filter(matches)
    } else {
      const profileRows: Row[] = people.map((p, i) => ({
        key: `p:${p.id}`, groupKind: 'person', id: p.id, ownerKey: `p:${p.id}`, name: p.name,
        subtitle: p.title || (p.person_type ?? '—'), tags: p.tags ?? [], color: p.color || PALETTE[i % PALETTE.length],
        capacity: Number(p.daily_hours ?? 8) * 5, deletable: false, editable: false,
      }))
      const resourceRows: Row[] = resourcePeople.map((r, i) => ({
        key: `r:${r.id}`, groupKind: 'person', id: r.id, ownerKey: `r:${r.id}`, name: r.name,
        subtitle: r.title || (r.kind === 'vendor' ? 'Vendor' : 'Placeholder'), tags: r.tags ?? [],
        color: r.color || PALETTE[(people.length + i) % PALETTE.length],
        capacity: Number(r.daily_hours ?? 8) * 5, deletable: true, editable: true,
      }))
      list = [...profileRows, ...resourceRows].filter(row => {
        if (typeFilter !== 'all') {
          if (typeFilter === 'placeholder' || typeFilter === 'vendor') {
            const rp = resourcePeople.find(r => r.id === row.id)
            if (!rp || rp.kind !== typeFilter) return false
          } else {
            const pr = people.find(p => p.id === row.id)
            if (!pr || pr.person_type !== typeFilter) return false
          }
        }
        return matches(row)
      })
    }
    return list.sort((a, b) =>
      sortBy === 'role'
        ? a.subtitle.localeCompare(b.subtitle) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, resourcePeople, projects, nameFilter, typeFilter, groupBy, sortBy])

  const rangeStart = useMemo(() => mondayOf(weekStart), [weekStart])
  const weeks = useMemo(() => Array.from({ length: totalDays / 7 }, (_, i) => addDays(rangeStart, i * 7)), [rangeStart, totalDays])
  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i)), [rangeStart, totalDays])
  // Day indices (from rangeStart) that fall on Sat/Sun — used to crosshatch the
  // weekend portion of allocation bars.
  const weekendDayIdx = useMemo(
    () => days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6 ? i : -1)).filter(i => i >= 0),
    [days],
  )
  const rangeEnd = addDays(rangeStart, totalDays - 1)
  const todayMon = mondayOf(today).getTime()
  const todayISO = toISO(today)

  // Contiguous month spans for the header band
  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; startDay: number; len: number; yr: number }[] = []
    days.forEach((d, i) => {
      const label = d.toLocaleDateString('en-CA', { month: 'short' })
      const yr = d.getFullYear()
      const last = groups[groups.length - 1]
      if (last && last.label === label && last.yr === yr) last.len++
      else groups.push({ key: `${label}-${yr}-${i}`, label, startDay: i, len: 1, yr })
    })
    return groups
  }, [days])

  const weekendBg = `repeating-linear-gradient(90deg, transparent 0px, transparent ${5 * DAY_W}px, rgba(15,23,42,0.06) ${5 * DAY_W}px, rgba(15,23,42,0.06) ${7 * DAY_W}px)`

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
    if (row.groupKind === 'project') return []
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

  // Per-DAY availability summary for a person's week: looks at the busiest
  // working day (peak hours/day committed) vs their daily capacity.
  function personWeekSummary(row: Row, wkMonday: Date): { label: string; cls: string } {
    const dailyH = row.capacity / 5
    const allocs = allocations.filter(a => allocInRow(a, row))
    const tos = timeOff.filter(t => ownerKey(t) === row.ownerKey)
    let peak = 0
    let workDays = 0
    for (let k = 0; k < 5; k++) {
      const iso = toISO(addDays(wkMonday, k))
      if (tos.some(t => iso >= t.start_date && iso <= t.end_date)) continue
      workDays++
      let load = 0
      for (const a of allocs) if (iso >= a.start_date && iso <= a.end_date) load += Number(a.hours_per_day)
      if (load > peak) peak = load
    }
    if (workDays === 0) return { label: 'Off', cls: 'bg-neutral-700 text-white' }
    if (peak > dailyH + 0.001) return { label: `${fmtH(peak - dailyH)}h/d over`, cls: 'bg-red-500 text-white' }
    if (Math.abs(peak - dailyH) < 0.001) return { label: 'Full', cls: 'bg-emerald-600 text-white' }
    const rem = dailyH - peak
    return { label: `${fmtH(rem)}h/d open`, cls: peak === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-100 text-emerald-800' }
  }

  function barGeometry(startStr: string, endStr: string) {
    const startDay = Math.max(0, daysBetween(rangeStart, parseISO(startStr)))
    const endDay = Math.min(totalDays - 1, daysBetween(rangeStart, parseISO(endStr)))
    const left = startDay * DAY_W
    const width = Math.max(DAY_W, (endDay - startDay + 1) * DAY_W)
    return { left, width }
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function collapseAll() {
    setCollapsed(prev => prev.size >= rows.length ? new Set() : new Set(rows.map(r => r.key)))
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
        setPreview({ createRowKey: d.rowKey, createStartDay: d.curStartDay, createEndDay: d.curEndDay, createLane: d.lane })
        return
      }
      const deltaDays = Math.round((ev.clientX - d.startX) / DAY_W)
      if (Math.abs(ev.clientX - d.startX) > DRAG_THRESHOLD) d.moved = true
      if (d.mode === 'move') {
        d.curStart = addISO(d.origStart, deltaDays); d.curEnd = addISO(d.origEnd, deltaDays)
      } else if (d.mode === 'left') {
        let ns = addISO(d.origStart, deltaDays); if (ns > d.origEnd) ns = d.origEnd
        d.curStart = ns; d.curEnd = d.origEnd
      } else {
        let ne = addISO(d.origEnd, deltaDays); if (ne < d.origStart) ne = d.origStart
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
          ? { projectId: d.rowKey.slice(5), owner: d.prefillOwner, start, end }
          : { owner: d.rowKey, projectId: d.prefillProjectId, start, end }
        setAllocDialog({ open: true, edit: null, prefill })
        setError(null)
        return
      }

      const alloc = allocations.find(a => a.id === d.id)
      if (!alloc) return
      if (!d.moved) { setAllocDialog({ open: true, edit: alloc }); setError(null); return }
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
      await updateAllocation(alloc.id, { personId: alloc.person_id, resourcePersonId: alloc.resource_person_id }, alloc.project_id, start, end, alloc.hours_per_day, alloc.note ?? '')
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
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setSaving(false) }
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
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setSaving(false) }
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
    const title = (fd.get('title') as string) ?? ''
    const tags = parseTags((fd.get('tags') as string) ?? '')
    const color = fd.get('color') as string
    const dailyHours = Number(fd.get('daily_hours'))
    setSaving(true); setError(null)
    try {
      if (personDialog.edit) {
        const id = personDialog.edit.id
        await updateResourcePerson(id, name, kind, title, tags, color, dailyHours)
        setResourcePeople(prev => prev.map(r => r.id === id ? { ...r, name, kind, title: title || null, tags, color: color || null, daily_hours: dailyHours } : r))
      } else {
        const created = await createResourcePerson(name, kind, title, tags, color, dailyHours)
        setResourcePeople(prev => [...prev, created])
      }
      setPersonDialog({ open: false, edit: null })
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setSaving(false) }
  }

  async function handleDeletePerson(id: string) {
    await deleteResourcePerson(id)
    setResourcePeople(prev => prev.filter(r => r.id !== id))
    setAllocations(prev => prev.filter(a => a.resource_person_id !== id))
    setTimeOff(prev => prev.filter(t => t.resource_person_id !== id))
    setPersonDialog({ open: false, edit: null })
  }

  async function handleMilestoneSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setSaving(true); setError(null)
    try {
      const created = await createMilestone(fd.get('project_id') as string, fd.get('date') as string, fd.get('name') as string)
      setMilestones(prev => [...prev, created])
      setMilestoneOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setSaving(false) }
  }

  async function handleDeleteMilestone(id: string) {
    await deleteMilestone(id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  async function handleShiftSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const projectId = (fd.get('project_id') as string) || null
    const from = fd.get('from') as string
    const to = fd.get('to') as string
    if (from === to) { setError('Pick two different dates to shift by.'); return }
    setSaving(true); setError(null)
    try {
      const updates = await shiftTimeline(projectId, from, to)
      const map = new Map(updates.map(u => [u.id, u]))
      setAllocations(prev => prev.map(a => map.has(a.id) ? { ...a, start_date: map.get(a.id)!.start_date, end_date: map.get(a.id)!.end_date } : a))
      setShiftOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setSaving(false) }
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
    const link = document.createElement('a'); link.href = url; link.download = 'resourcing.csv'; link.click()
    URL.revokeObjectURL(url)
  }

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

  const tabCls = (active: boolean) =>
    `px-1 pb-1 text-sm font-medium border-b-2 transition-colors ${active ? 'border-[#3E0BE5] text-[#3E0BE5]' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`

  // Vertical day/week guide lines — rendered identically in every band + track
  // so they line up into continuous columns through the whole grid.
  function columnGuides(withDays: boolean) {
    return (
      <>
        {withDays && showDayLabels && days.map((_, i) => i === 0 ? null : (
          <div key={`d${i}`} className="absolute top-0 bottom-0 border-l border-neutral-200 pointer-events-none" style={{ left: i * DAY_W }} />
        ))}
        {weeks.map((_, i) => i === 0 ? null : (
          <div key={`w${i}`} className="absolute top-0 bottom-0 border-l border-neutral-300 pointer-events-none" style={{ left: i * COL_W }} />
        ))}
      </>
    )
  }

  return (
    <div>
      {/* Controls — sticky so tools stay in view while scrolling the roster */}
      <div className="sticky top-0 z-30 bg-[#F8F8F8] -mx-8 px-8 pt-1 pb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <button type="button" className={tabCls(groupBy === 'people')} onClick={() => setGroupBy('people')}>Team</button>
          <button type="button" className={tabCls(groupBy === 'projects')} onClick={() => setGroupBy('projects')}>Projects</button>
          <button type="button" onClick={collapseAll} title="Collapse / expand all"
            className="ml-1 h-8 w-8 flex items-center justify-center border border-neutral-200 rounded-[4px] text-neutral-500 hover:bg-neutral-50">
            <ChevronsDownUp size={15} />
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input type="text" placeholder="Search…" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
              className="h-8 text-sm border border-neutral-200 rounded-[4px] pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-neutral-900 w-40" />
          </div>
          {groupBy === 'people' && (
            <>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
                className="h-8 text-sm border border-neutral-200 rounded-[4px] px-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white">
                <option value="all">All Types</option>
                <option value="employee">Employees</option>
                <option value="freelancer">Freelancers</option>
                <option value="placeholder">Placeholders</option>
                <option value="vendor">Vendors</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'role')}
                className="h-8 text-sm border border-neutral-200 rounded-[4px] px-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white" title="Sort">
                <option value="name">Sort: Name</option>
                <option value="role">Sort: Role</option>
              </select>
            </>
          )}
          <select value={zoomIdx} onChange={e => setZoomIdx(Number(e.target.value))}
            className="h-8 text-sm border border-neutral-200 rounded-[4px] px-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white">
            {ZOOMS.map((z, i) => <option key={z.label} value={i}>{z.label}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(addDays(rangeStart, -stepDays)))}><ChevronLeft size={15} /></Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(addDays(rangeStart, stepDays)))}><ChevronRight size={15} /></Button>
          </div>
          <span className="mx-1 h-5 w-px bg-neutral-200" />
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportCSV}><Download size={13} /> CSV</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setProjectOpen(true)}><FolderPlus size={13} /> Project</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setPersonDialog({ open: true, edit: null }) }}><UserPlus size={13} /> Person</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setMilestoneOpen(true) }}><Flag size={13} /> Milestone</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setShiftOpen(true) }}><CalendarClock size={13} /> Shift</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setTimeOffOpen(true) }}><CalendarOff size={13} /> Time Off</Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { setError(null); setAllocDialog({ open: true, edit: null }) }}><Plus size={14} /> Assignment</Button>
        </div>
      </div>

      <p className="text-xs text-neutral-400 mb-2">Tip: expand a row and drag to draw an assignment; drag a bar to move it or grab an edge to resize.</p>

      {/* Timeline grid — scrolls internally so the date header can stick */}
      <div ref={containerRef} className="bg-white border border-neutral-200 rounded-[4px] overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
          <div style={{ minWidth: LABEL_W + gridW }}>
            {/* Sticky date header: month → week → day, with continuous column guides */}
            <div className="sticky top-0 z-20 bg-neutral-50">
              {/* Month + week-number band */}
              <div className="flex border-b border-neutral-200">
                <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-300" />
                <div className="relative" style={{ width: gridW, height: 24 }}>
                  {columnGuides(false)}
                  {weeks.map((wk, i) => (
                    <span key={`wn${i}`} className="absolute top-1 text-[9px] font-medium text-neutral-400" style={{ left: i * COL_W + 4 }}>
                      {getISOWeek(wk).week}
                    </span>
                  ))}
                  {monthGroups.map(g => (
                    <div key={g.key} className="absolute inset-y-0 flex items-center justify-center" style={{ left: g.startDay * DAY_W, width: g.len * DAY_W }}>
                      <span className="text-xs font-semibold text-neutral-700">
                        {g.label}{g.startDay === 0 || g.label === 'Jan' ? ` ${g.yr}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day / week band — numbers only; weekends shown by column shading */}
              <div className="flex border-b border-neutral-300">
                <div style={{ width: LABEL_W }} className="shrink-0 border-r border-neutral-300" />
                <div className="relative" style={{ width: gridW, height: 28, background: weekendBg }}>
                  {columnGuides(showDayLabels)}
                  {showDayLabels
                    ? days.map((d, i) => {
                      const isToday = toISO(d) === todayISO
                      return (
                        <div key={i} className="absolute flex items-center justify-center" style={{ left: i * DAY_W, width: DAY_W, top: 0, bottom: 0 }}>
                          <span className={`text-[11px] leading-none flex items-center justify-center ${isToday ? 'bg-[#3E0BE5] text-white rounded-full w-[20px] h-[20px]' : 'text-neutral-600'}`}>{d.getDate()}</span>
                        </div>
                      )
                    })
                    : weeks.map((wk, i) => (
                      <div key={i} className="absolute flex items-center justify-center" style={{ left: i * COL_W, width: COL_W, top: 0, bottom: 0 }}>
                        <span className="text-[11px] text-neutral-600">
                          {COL_W >= 52 ? wk.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : wk.getDate()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Rows */}
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-neutral-400">{groupBy === 'projects' ? 'No projects match this filter.' : 'No people match this filter.'}</div>
            ) : (
              rows.map(row => {
                const expanded = !collapsed.has(row.key)
                const allocs = rowAllocations(row)
                const laneOf = assignLanes(allocs)
                const laneCount = Math.max(1, ...Array.from(laneOf.values()).map(l => l + 1))
                const tos = rowTimeOff(row)
                const isProject = row.groupKind === 'project'
                const rowMilestones = isProject
                  ? milestones.map(m => ({ m, day: daysBetween(rangeStart, parseISO(m.date)) }))
                      .filter(({ m, day }) => m.project_id === row.id && day >= 0 && day < totalDays)
                  : []

                const summaryTop = ROW_PAD
                const summaryH = BAR_H
                const barsTop = ROW_PAD + summaryH + LANE_GAP
                const timeOffH = laneCount * BAR_H + (laneCount - 1) * LANE_GAP
                const emptyLaneTop = barsTop + laneCount * (BAR_H + LANE_GAP)
                const rowH = expanded
                  ? barsTop + (laneCount + 1) * BAR_H + laneCount * LANE_GAP + ROW_PAD
                  : ROW_PAD * 2 + summaryH
                const isCreatingHere = preview?.createRowKey === row.key
                const rp = row.editable ? resourcePeople.find(r => r.id === row.id) : undefined

                return (
                  <div key={row.key} className="flex border-b border-neutral-100 last:border-0 group/row">
                    {/* Label */}
                    <div style={{ width: LABEL_W, minHeight: rowH }} className="shrink-0 border-r border-neutral-200 pl-2 pr-3 py-2.5 flex items-start gap-1.5">
                      <button onClick={() => toggleCollapse(row.key)} className="mt-0.5 text-neutral-400 hover:text-neutral-700 shrink-0" title={expanded ? 'Collapse' : 'Expand'}>
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: row.color }}>
                        {row.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{row.name}</p>
                        <p className="text-xs text-neutral-400 capitalize truncate">{row.subtitle}</p>
                        {row.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 overflow-hidden">
                            {row.tags.slice(0, 4).map(t => (
                              <span key={t} className="text-[9px] leading-none px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 whitespace-nowrap">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {row.editable && rp && (
                        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 shrink-0">
                          <button onClick={() => { setError(null); setPersonDialog({ open: true, edit: rp }) }} className="text-neutral-300 hover:text-neutral-700" title="Edit person"><Pencil size={13} /></button>
                          <button onClick={() => handleDeletePerson(row.id)} className="text-neutral-300 hover:text-red-600" title="Remove person"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>

                    {/* Track */}
                    <div
                      className={`relative ${expanded ? 'cursor-crosshair' : 'cursor-pointer'}`}
                      style={{ width: gridW, height: rowH, background: weekendBg }}
                      onPointerDown={expanded ? (e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const startDay = Math.max(0, Math.min(totalDays - 1, Math.floor((e.clientX - rect.left) / DAY_W)))
                        // Which lane did the drag start on? If it's an occupied lane, the new
                        // allocation inherits that lane's resource (person in a project row,
                        // project in a person row) so you can draw a gap on the same line.
                        const laneIdx = Math.floor((e.clientY - rect.top - barsTop) / (BAR_H + LANE_GAP))
                        const laneAllocs = laneIdx >= 0 && laneIdx < laneCount
                          ? allocs.filter(a => (laneOf.get(a.id) ?? 0) === laneIdx)
                          : []
                        let target: ResourceAllocation | undefined
                        for (const a of laneAllocs) {
                          if (!target || Math.abs(daysBetween(rangeStart, parseISO(a.start_date)) - startDay)
                            < Math.abs(daysBetween(rangeStart, parseISO(target.start_date)) - startDay)) target = a
                        }
                        beginDrag(e, {
                          mode: 'create', rowKey: row.key, trackLeft: rect.left, startDay, moved: false,
                          lane: target ? laneIdx : laneCount,
                          prefillOwner: isProject && target ? ownerKey(target) : undefined,
                          prefillProjectId: !isProject && target ? target.project_id : undefined,
                        })
                      } : undefined}
                      onClick={!expanded ? () => toggleCollapse(row.key) : undefined}
                    >
                      {/* Continuous day/week guides + current-week tint */}
                      {columnGuides(true)}
                      {weeks.map((wk, i) => todayMon === wk.getTime() ? (
                        <div key={`t${i}`} className="absolute top-0 bottom-0 bg-purple-50/40 pointer-events-none" style={{ left: i * COL_W, width: COL_W }} />
                      ) : null)}

                      {/* Top lane — people: weekly availability (per-day); projects: milestones */}
                      {isProject
                        ? rowMilestones.map(({ m, day }) => (
                          <div key={m.id} className="absolute group/ms -translate-x-1/2 flex flex-col items-center" style={{ left: day * DAY_W + DAY_W / 2, top: summaryTop + 2 }}
                            title={`${m.name} (${m.date})`}>
                            <Flag size={14} style={{ color: row.color }} className="fill-current" />
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteMilestone(m.id) }} className="opacity-0 group-hover/ms:opacity-100 text-[9px] text-neutral-400 hover:text-red-600 leading-none mt-0.5">✕</button>
                          </div>
                        ))
                        : weeks.map((wk, i) => {
                          const s = personWeekSummary(row, wk)
                          return (
                            <div key={i} className={`absolute rounded-[3px] flex items-center justify-center pointer-events-none ${s.cls}`}
                              style={{ left: i * COL_W + 2, width: COL_W - 4, top: summaryTop, height: summaryH }}>
                              <span className="text-[10px] font-medium truncate px-1">{s.label}</span>
                            </div>
                          )
                        })}

                      {expanded && <>
                        {/* Empty drag lane */}
                        {!isCreatingHere && (
                          <div className="absolute rounded-[4px] border border-dashed border-neutral-300 bg-neutral-50/40 pointer-events-none flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
                            style={{ left: 0, width: gridW, top: emptyLaneTop, height: BAR_H }}>
                            <span className="text-[10px] text-neutral-400">Drag to add an allocation</span>
                          </div>
                        )}
                        {isCreatingHere && preview?.createStartDay != null && (
                          <div className="absolute rounded-[4px] border-2 border-dashed border-neutral-400 bg-neutral-200/40 pointer-events-none"
                            style={{ left: preview.createStartDay * DAY_W, width: (preview.createEndDay! - preview.createStartDay! + 1) * DAY_W, top: barsTop + (preview.createLane ?? laneCount) * (BAR_H + LANE_GAP), height: BAR_H }} />
                        )}

                        {/* Time off */}
                        {tos.map(to => {
                          const { left, width } = barGeometry(to.start_date, to.end_date)
                          return (
                            <div key={to.id} className="absolute rounded-[3px] flex items-center px-2 group/to" onPointerDown={e => e.stopPropagation()}
                              style={{ left, width, top: barsTop, height: timeOffH, backgroundColor: '#f1f5f9',
                                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(100,116,139,0.12) 5px, rgba(100,116,139,0.12) 10px)', border: '1px solid #e2e8f0' }}
                              title={`${TIME_OFF_LABELS[to.type]} · ${to.start_date} → ${to.end_date}`}>
                              <span className="text-[11px] font-medium text-neutral-500 truncate">{TIME_OFF_LABELS[to.type]}</span>
                              <button onClick={() => handleDeleteTimeOff(to.id)} className="opacity-0 group-hover/to:opacity-100 ml-auto text-neutral-400 hover:text-red-600"><Trash2 size={12} /></button>
                            </div>
                          )
                        })}

                        {/* Allocation bars */}
                        {allocs.map(a => {
                          const eff = preview?.id === a.id ? { start: preview.start_date!, end: preview.end_date! } : { start: a.start_date, end: a.end_date }
                          const { left, width } = barGeometry(eff.start, eff.end)
                          const startDay = Math.max(0, daysBetween(rangeStart, parseISO(eff.start)))
                          const endDay = Math.min(totalDays - 1, daysBetween(rangeStart, parseISO(eff.end)))
                          const lane = laneOf.get(a.id) ?? 0
                          const hpd = Number(a.hours_per_day)
                          const total = hpd * workingDaysBetween(eff.start, eff.end)
                          const owner = personDisplay.get(ownerKey(a))
                          const name = row.groupKind === 'project' ? (owner?.name ?? 'Person') : (projectMap.get(a.project_id)?.project.name ?? 'Project')
                          const barColor = row.groupKind === 'project' ? (owner?.color ?? PALETTE[0]) : projColor(a.project_id)
                          return (
                            <div key={a.id}
                              onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { mode: 'move', id: a.id, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date, moved: false }) }}
                              className="absolute rounded-[4px] overflow-hidden flex items-center text-left hover:brightness-110 transition-[filter] cursor-grab active:cursor-grabbing group/bar select-none"
                              style={{ left, width, top: barsTop + lane * (BAR_H + LANE_GAP), height: BAR_H, backgroundColor: barColor }}
                              title={`${name} · ${hpd}h/day · ${total}h total · ${eff.start} → ${eff.end}`}>
                              {/* Weekend days crosshatched — no work scheduled */}
                              {weekendDayIdx.filter(wi => wi >= startDay && wi <= endDay).map(wi => (
                                <div key={`we${wi}`} className="absolute top-0 bottom-0 pointer-events-none"
                                  style={{ left: (wi - startDay) * DAY_W, width: DAY_W, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0.45) 2px, transparent 2px, transparent 6px)' }} />
                              ))}
                              <div onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { mode: 'left', id: a.id, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date, moved: false }) }}
                                className="absolute left-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-black/20 rounded-l-[4px]" style={{ width: HANDLE_W }} />
                              <span className="text-[11px] font-medium text-white truncate px-2 pointer-events-none">{name} · {hpd}h/d · {total}h</span>
                              <div onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { mode: 'right', id: a.id, startX: e.clientX, origStart: a.start_date, origEnd: a.end_date, moved: false }) }}
                                className="absolute right-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-black/20 rounded-r-[4px]" style={{ width: HANDLE_W }} />
                            </div>
                          )
                        })}
                      </>}
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

      {/* Resource person dialog (add / edit) */}
      <Dialog open={personDialog.open} onOpenChange={v => { if (!v) setPersonDialog({ open: false, edit: null }) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{personDialog.edit ? 'Edit placeholder / vendor' : 'Add placeholder / vendor'}</DialogTitle></DialogHeader>
          <form key={personDialog.edit?.id ?? 'new'} onSubmit={handlePersonSubmit} className="space-y-3 pt-1">
            <Field label="Name"><input name="name" type="text" required defaultValue={personDialog.edit?.name ?? ''} placeholder="e.g. Motion Designer (TBD), Acme Studio" className={inputCls} /></Field>
            <Field label="Role"><input name="title" type="text" defaultValue={personDialog.edit?.title ?? ''} placeholder="Designer, Developer, Editor…" className={inputCls} /></Field>
            <Field label="Tags"><input name="tags" type="text" defaultValue={(personDialog.edit?.tags ?? []).join(', ')} placeholder="Sr, Motion, 3D (comma-separated)" className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select name="kind" defaultValue={personDialog.edit?.kind ?? 'placeholder'} required className={selectCls}>
                  <option value="placeholder">Placeholder (unfilled role)</option>
                  <option value="vendor">Vendor (external)</option>
                </select>
              </Field>
              <Field label="Daily hours"><input name="daily_hours" type="number" min="0" max="24" step="0.5" defaultValue={personDialog.edit?.daily_hours ?? 8} required className={inputCls} /></Field>
            </div>
            <Field label="Colour"><input name="color" type="color" defaultValue={personDialog.edit?.color ?? '#3E0BE5'} className="h-9 w-16 border border-neutral-200 rounded-[4px] p-1 cursor-pointer" /></Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center justify-between pt-1">
              {personDialog.edit ? (
                <Button type="button" variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => handleDeletePerson(personDialog.edit!.id)}><Trash2 size={13} /> Delete</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPersonDialog({ open: false, edit: null })}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : personDialog.edit ? 'Save' : 'Add'}</Button>
              </div>
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

      {/* Shift timeline dialog */}
      <Dialog open={shiftOpen} onOpenChange={v => { if (!v) setShiftOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Shift timeline</DialogTitle></DialogHeader>
          <p className="text-sm text-neutral-500 -mt-1">Project delayed? Move all assignments starting on or after a date forward (or back) in the timeline.</p>
          <form onSubmit={handleShiftSubmit} className="space-y-3 pt-2">
            <Field label="Scope">
              <select name="project_id" defaultValue="" className={selectCls}>
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shift assignments from"><input name="from" type="date" defaultValue={toISO(today)} required className={inputCls} /></Field>
              <Field label="to instead start on"><input name="to" type="date" defaultValue={toISO(addDays(today, 7))} required className={inputCls} /></Field>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setShiftOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? 'Shifting…' : 'Shift timeline'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* New project dialog — reuses the standard project form */}
      <Dialog open={projectOpen} onOpenChange={v => { if (!v) setProjectOpen(false) }}>
        <DialogContent>
          <ProjectForm onSuccess={() => { setProjectOpen(false); router.refresh() }} />
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
