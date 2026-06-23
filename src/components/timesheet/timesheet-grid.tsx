'use client'

import { useState, useCallback, useTransition } from 'react'
import { format } from 'date-fns'
import { getWeekDays } from '@/lib/utils'
import { saveTimeEntry, submitWeek, unlockWeek } from '@/app/(contributor)/timesheet/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Send, Lock, Pencil } from 'lucide-react'
import type { TimeEntry, EntryStatus } from '@/lib/types'

interface Project {
  id: string
  name: string
  client: string
  status: string
}

interface TimesheetGridProps {
  projects: Project[]
  timeEntries: TimeEntry[]
  monday: Date
  week: number
  year: number
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getEntryKey(projectId: string, date: string) {
  return `${projectId}:${date}`
}

function getStatusVariant(status: EntryStatus): 'draft' | 'submitted' | 'approved' | 'rejected' {
  return status as 'draft' | 'submitted' | 'approved' | 'rejected'
}

function getRowStatus(entries: TimeEntry[]): EntryStatus {
  if (entries.length === 0) return 'draft'
  const statuses = entries.map(e => e.status)
  if (statuses.some(s => s === 'approved')) return 'approved'
  if (statuses.some(s => s === 'submitted')) return 'submitted'
  if (statuses.some(s => s === 'rejected')) return 'rejected'
  return 'draft'
}

export function TimesheetGrid({
  projects,
  timeEntries,
  monday,
  week,
  year,
}: TimesheetGridProps) {
  const mondayDate = monday instanceof Date ? monday : new Date(monday)
  const days = getWeekDays(mondayDate)

  // Build initial entry map
  const buildEntryMap = () => {
    const map = new Map<string, { hours: string; status: EntryStatus; id?: string }>()
    for (const entry of timeEntries) {
      const key = getEntryKey(entry.project_id, entry.date)
      map.set(key, {
        hours: entry.hours.toString(),
        status: entry.status,
        id: entry.id,
      })
    }
    return map
  }

  const [entryMap, setEntryMap] = useState(buildEntryMap)
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // Determine overall week status
  const weekEntries = timeEntries
  const weekStatus: EntryStatus = weekEntries.length === 0 ? 'draft' : getRowStatus(weekEntries)
  const isLocked = !isUnlocked && (weekStatus === 'submitted' || weekStatus === 'approved')

  const handleCellBlur = useCallback(
    async (projectId: string, date: string, value: string) => {
      const hours = parseFloat(value) || 0
      const key = getEntryKey(projectId, date)

      setSavingKeys(prev => new Set(prev).add(key))
      try {
        await saveTimeEntry(projectId, date, hours)
        setEntryMap(prev => {
          const next = new Map(prev)
          if (hours === 0) {
            next.delete(key)
          } else {
            next.set(key, { hours: hours.toString(), status: 'draft' })
          }
          return next
        })
      } catch (err) {
        console.error('Error saving entry:', err)
      } finally {
        setSavingKeys(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    []
  )

  const handleCellChange = useCallback(
    (projectId: string, date: string, value: string) => {
      const key = getEntryKey(projectId, date)
      setEntryMap(prev => {
        const next = new Map(prev)
        const existing = next.get(key)
        next.set(key, { hours: value, status: existing?.status ?? 'draft', id: existing?.id })
        return next
      })
    },
    []
  )

  function handleSubmitWeek() {
    setSubmitError(null)
    startTransition(async () => {
      try {
        await submitWeek(week, year)
        setSubmitSuccess(true)
        setIsUnlocked(false)
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
      }
    })
  }

  function handleUnlockWeek() {
    setUnlockError(null)
    startTransition(async () => {
      try {
        await unlockWeek(week, year)
        setEntryMap(prev => {
          const next = new Map(prev)
          Array.from(next.entries()).forEach(([key, val]) => {
            next.set(key, { ...val, status: 'draft' })
          })
          return next
        })
        setIsUnlocked(true)
        setSubmitSuccess(false)
      } catch (err) {
        setUnlockError(err instanceof Error ? err.message : 'Failed to unlock week')
      }
    })
  }

  // Calculate day totals
  const dayTotals = days.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd')
    return projects.reduce((sum, p) => {
      const key = getEntryKey(p.id, dateStr)
      const val = parseFloat(entryMap.get(key)?.hours ?? '0') || 0
      return sum + val
    }, 0)
  })

  // Calculate row totals
  const rowTotals = projects.map(project => {
    return days.reduce((sum, day) => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const key = getEntryKey(project.id, dateStr)
      const val = parseFloat(entryMap.get(key)?.hours ?? '0') || 0
      return sum + val
    }, 0)
  })

  const grandTotal = rowTotals.reduce((s, t) => s + t, 0)

  // Entries per project row
  const projectEntries = (projectId: string) =>
    timeEntries.filter(e => e.project_id === projectId)

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-[4px] p-12 text-center space-y-2">
        <p className="text-neutral-600 text-sm font-medium">No projects assigned yet.</p>
        <p className="text-neutral-400 text-xs">
          Ask your producer to assign you to a project. Once assigned, your projects will appear here.
        </p>
        <p className="text-neutral-300 text-xs pt-2 font-mono">
          Debug: visiting <span className="underline">/api/debug</span> in this browser tab will show your session data.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Badge variant={getStatusVariant(isUnlocked ? 'draft' : weekStatus)}>
            {isUnlocked ? 'Draft'
              : weekStatus === 'draft' ? 'Draft'
              : weekStatus === 'submitted' ? 'Submitted for review'
              : weekStatus === 'approved' ? 'Approved'
              : 'Rejected'}
          </Badge>
          {submitSuccess && (
            <span className="text-xs text-green-600 font-medium">Week submitted for re-approval.</span>
          )}
          {submitError && (
            <span className="text-xs text-red-600">{submitError}</span>
          )}
          {unlockError && (
            <span className="text-xs text-red-600">{unlockError}</span>
          )}
          {isUnlocked && (
            <span className="text-xs text-amber-600 font-medium">Editing — re-submit to request approval.</span>
          )}
        </div>

        {!isLocked && (
          <Button
            size="sm"
            onClick={handleSubmitWeek}
            disabled={isPending || grandTotal === 0}
          >
            <Send size={14} />
            {isPending ? 'Submitting...' : 'Submit Week'}
          </Button>
        )}

        {isLocked && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Lock size={11} />
              {weekStatus === 'submitted' ? 'Awaiting approval' : 'Approved'}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUnlockWeek}
              disabled={isPending}
              className="h-7 text-xs px-2"
            >
              <Pencil size={11} />
              {isPending ? 'Unlocking...' : 'Edit Week'}
            </Button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="bg-white border border-neutral-200 rounded-[4px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-56">
                Project
              </th>
              {days.map((day, i) => (
                <th
                  key={i}
                  className={`px-2 py-3 text-center text-xs font-medium uppercase tracking-wider w-20 ${
                    i >= 5 ? 'text-neutral-400' : 'text-neutral-500'
                  }`}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="font-mono text-neutral-400 text-[10px] font-normal">
                    {format(day, 'M/d')}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider w-20">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider w-20">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project, rowIdx) => {
              const rowStatus = getRowStatus(projectEntries(project.id))
              const rowTotal = rowTotals[rowIdx]

              return (
                <tr
                  key={project.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium text-neutral-900 text-sm leading-tight">{project.name}</div>
                    <div className="text-neutral-400 text-xs">{project.client}</div>
                  </td>
                  {days.map((day, dayIdx) => {
                    const dateStr = format(day, 'yyyy-MM-dd')
                    const key = getEntryKey(project.id, dateStr)
                    const entry = entryMap.get(key)
                    const isSaving = savingKeys.has(key)
                    const isWeekend = dayIdx >= 5
                    const cellLocked = isLocked

                    return (
                      <td
                        key={dayIdx}
                        className={`px-1 py-2 text-center ${isWeekend ? 'bg-neutral-50/50' : ''}`}
                      >
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          value={entry?.hours ?? ''}
                          onChange={e => handleCellChange(project.id, dateStr, e.target.value)}
                          onBlur={e => handleCellBlur(project.id, dateStr, e.target.value)}
                          disabled={cellLocked}
                          placeholder="—"
                          className={`w-full text-center text-sm font-mono border rounded-[4px] py-1.5 px-1 focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-colors ${
                            cellLocked
                              ? 'bg-neutral-50 border-neutral-100 text-neutral-400 cursor-not-allowed'
                              : 'border-neutral-200 bg-white hover:border-neutral-300 focus:border-transparent'
                          } ${isSaving ? 'opacity-50' : ''} ${
                            isWeekend && !entry ? 'border-neutral-100' : ''
                          }`}
                        />
                      </td>
                    )
                  })}
                  <td className="px-4 py-2 text-center">
                    <span className={`font-mono text-sm font-medium ${rowTotal > 0 ? 'text-neutral-900' : 'text-neutral-300'}`}>
                      {rowTotal > 0 ? `${rowTotal.toFixed(1)}h` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {projectEntries(project.id).length > 0 ? (
                      <Badge variant={getStatusVariant(rowStatus)} className="text-[10px] py-0 px-1.5">
                        {rowStatus}
                      </Badge>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50">
              <td className="px-4 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Daily Total
              </td>
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
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-neutral-400 mt-3">
        Hours save automatically when you leave a cell. Submit the week when complete.
      </p>
    </div>
  )
}
