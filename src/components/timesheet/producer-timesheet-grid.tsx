'use client'

import { useState, useCallback } from 'react'
import { format } from 'date-fns'
import { getWeekDays } from '@/lib/utils'
import { saveProducerTime } from '@/app/(producer)/time/actions'
import type { TimeEntry } from '@/lib/types'

interface Project { id: string; name: string; client: string; status: string }

interface Props {
  projects: Project[]
  timeEntries: TimeEntry[]
  monday: Date
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const key = (projectId: string, date: string) => `${projectId}:${date}`

export function ProducerTimesheetGrid({ projects, timeEntries, monday }: Props) {
  const mondayDate = monday instanceof Date ? monday : new Date(monday)
  const days = getWeekDays(mondayDate)

  const [entryMap, setEntryMap] = useState(() => {
    const m = new Map<string, string>()
    for (const e of timeEntries) m.set(key(e.project_id, e.date), e.hours.toString())
    return m
  })
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleBlur = useCallback(async (projectId: string, date: string, value: string) => {
    const hours = parseFloat(value) || 0
    const k = key(projectId, date)
    setSavingKeys(prev => new Set(prev).add(k))
    try {
      await saveProducerTime(projectId, date, hours)
      setEntryMap(prev => {
        const next = new Map(prev)
        if (hours === 0) next.delete(k); else next.set(k, hours.toString())
        return next
      })
      setSaveError(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save — your hours were not stored. Try again.')
    } finally {
      setSavingKeys(prev => { const n = new Set(prev); n.delete(k); return n })
    }
  }, [])

  const handleChange = useCallback((projectId: string, date: string, value: string) => {
    setEntryMap(prev => { const n = new Map(prev); n.set(key(projectId, date), value); return n })
  }, [])

  const dayTotals = days.map(day => {
    const ds = format(day, 'yyyy-MM-dd')
    return projects.reduce((s, p) => s + (parseFloat(entryMap.get(key(p.id, ds)) ?? '0') || 0), 0)
  })
  const rowTotals = projects.map(p =>
    days.reduce((s, day) => s + (parseFloat(entryMap.get(key(p.id, format(day, 'yyyy-MM-dd'))) ?? '0') || 0), 0))
  const grandTotal = rowTotals.reduce((s, t) => s + t, 0)

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-[4px] p-12 text-center">
        <p className="text-neutral-600 text-sm font-medium">No active projects yet.</p>
        <p className="text-neutral-400 text-xs mt-1">Create a project to start logging billable time against it.</p>
      </div>
    )
  }

  return (
    <div>
      {saveError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-[4px] text-red-700 text-sm">
          {saveError}
        </div>
      )}
      <div className="bg-white border border-neutral-200 rounded-[4px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-56">Project</th>
              {days.map((day, i) => (
                <th key={i} className={`px-2 py-3 text-center text-xs font-medium uppercase tracking-wider w-20 ${i >= 5 ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  <div>{DAY_LABELS[i]}</div>
                  <div className="font-mono text-neutral-400 text-[10px] font-normal">{format(day, 'M/d')}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project, rowIdx) => (
              <tr key={project.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50">
                <td className="px-4 py-2">
                  <div className="font-medium text-neutral-900 text-sm leading-tight flex items-center gap-1.5">
                    {project.name}
                    {project.status === 'completed' && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400 font-normal">Completed</span>
                    )}
                  </div>
                  <div className="text-neutral-400 text-xs">{project.client}</div>
                </td>
                {days.map((day, dayIdx) => {
                  const ds = format(day, 'yyyy-MM-dd')
                  const k = key(project.id, ds)
                  const isWeekend = dayIdx >= 5
                  return (
                    <td key={dayIdx} className={`px-1 py-2 text-center ${isWeekend ? 'bg-neutral-50/50' : ''}`}>
                      <input
                        type="number" step="0.25" min="0" max="24"
                        value={entryMap.get(k) ?? ''}
                        onChange={e => handleChange(project.id, ds, e.target.value)}
                        onBlur={e => handleBlur(project.id, ds, e.target.value)}
                        placeholder="—"
                        className={`w-full text-center text-sm font-mono border rounded-[4px] py-1.5 px-1 focus:outline-none focus:ring-1 focus:ring-neutral-900 border-neutral-200 bg-white hover:border-neutral-300 ${savingKeys.has(k) ? 'opacity-50' : ''}`}
                      />
                    </td>
                  )
                })}
                <td className="px-4 py-2 text-center">
                  <span className={`font-mono text-sm font-medium ${rowTotals[rowIdx] > 0 ? 'text-neutral-900' : 'text-neutral-300'}`}>
                    {rowTotals[rowIdx] > 0 ? `${rowTotals[rowIdx].toFixed(1)}h` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50">
              <td className="px-4 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">Daily Total</td>
              {dayTotals.map((total, i) => (
                <td key={i} className="px-1 py-2 text-center">
                  <span className={`font-mono text-sm font-medium ${total > 0 ? 'text-neutral-900' : 'text-neutral-300'}`}>
                    {total > 0 ? `${total.toFixed(1)}h` : '—'}
                  </span>
                </td>
              ))}
              <td className="px-4 py-2 text-center">
                <span className={`font-mono text-sm font-semibold ${grandTotal > 0 ? 'text-neutral-900' : 'text-neutral-300'}`}>
                  {grandTotal > 0 ? `${grandTotal.toFixed(1)}h` : '—'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-neutral-400 mt-3">
        Your hours save automatically and are billable immediately — no approval needed. Edit any week, any time.
      </p>
    </div>
  )
}
