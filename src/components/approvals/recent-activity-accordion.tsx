'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { getMondayOfWeek, getWeekDays, formatHours } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface RecentEntry {
  id: string
  project_id: string
  date: string
  hours: number
}

export interface RecentGroup {
  key: string
  personName: string
  week: number
  year: number
  totalHours: number
  status: string
  resolvedAt: string | null
  projectBreakdown: { projectId: string; projectName: string; hours: number }[]
  entries: RecentEntry[]
}

export function RecentActivityAccordion({ groups }: { groups: RecentGroup[] }) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-neutral-500 text-sm">
        No recent approval activity.
      </div>
    )
  }

  return (
    <div className="divide-y divide-neutral-100">
      {groups.map(group => {
        const isOpen = openKeys.has(group.key)
        const monday = getMondayOfWeek(group.week, group.year)
        const days = getWeekDays(monday)

        // projectId:date -> hours
        const entryMap = new Map<string, number>()
        for (const e of group.entries) {
          entryMap.set(`${e.project_id}:${e.date}`, Number(e.hours))
        }

        return (
          <div key={group.key}>
            {/* Summary row */}
            <button
              onClick={() => toggle(group.key)}
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
            >
              <span className="text-neutral-400 shrink-0">
                {isOpen
                  ? <ChevronDown size={13} />
                  : <ChevronRight size={13} />}
              </span>

              <span className="font-medium text-neutral-900 w-36 shrink-0 text-sm truncate">
                {group.personName}
              </span>

              <span className="font-mono text-neutral-500 text-xs w-20 shrink-0">
                W{group.week} {group.year}
              </span>

              <span className="flex-1 min-w-0">
                {group.projectBreakdown.map(p => (
                  <span key={p.projectId} className="block text-xs text-neutral-400 truncate">
                    {p.projectName}
                    <span className="font-mono ml-1 text-neutral-500">{formatHours(p.hours)}</span>
                  </span>
                ))}
              </span>

              <span className="font-mono text-sm font-semibold text-neutral-900 w-14 text-right shrink-0">
                {formatHours(group.totalHours)}
              </span>

              <span className="text-neutral-400 text-xs w-24 shrink-0 text-right">
                {group.resolvedAt ? format(new Date(group.resolvedAt), 'MMM d, yyyy') : '—'}
              </span>

              <span className="w-20 shrink-0 flex justify-end" onClick={e => e.stopPropagation()}>
                <Badge variant={group.status as 'approved' | 'rejected'}>
                  {group.status === 'approved' ? 'Approved' : 'Rejected'}
                </Badge>
              </span>
            </button>

            {/* Expanded day grid */}
            {isOpen && (
              <div className="bg-[#F8F8F8] border-t border-neutral-100 px-6 py-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[10px] font-medium text-neutral-400 uppercase tracking-wider pb-2 pr-6 w-40">
                          Project
                        </th>
                        {days.map((day, i) => (
                          <th
                            key={i}
                            className={`text-center text-[10px] font-medium uppercase tracking-wider pb-2 w-14 ${
                              i >= 5 ? 'text-neutral-300' : 'text-neutral-400'
                            }`}
                          >
                            <div>{DAY_LABELS[i]}</div>
                            <div className="font-mono font-normal text-neutral-300">
                              {format(day, 'M/d')}
                            </div>
                          </th>
                        ))}
                        <th className="text-right text-[10px] font-medium text-neutral-400 uppercase tracking-wider pb-2 pl-4 w-14">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.projectBreakdown.map(project => {
                        const rowTotal = days.reduce((sum, day) => {
                          const h = entryMap.get(`${project.projectId}:${format(day, 'yyyy-MM-dd')}`)
                          return sum + (h ?? 0)
                        }, 0)

                        return (
                          <tr key={project.projectId} className="border-t border-neutral-100 first:border-0">
                            <td className="py-2 pr-6 text-xs font-medium text-neutral-700">{project.projectName}</td>
                            {days.map((day, i) => {
                              const hours = entryMap.get(`${project.projectId}:${format(day, 'yyyy-MM-dd')}`)
                              return (
                                <td
                                  key={i}
                                  className={`py-2 text-center font-mono text-xs ${
                                    i >= 5 ? 'text-neutral-300' : hours ? 'text-neutral-800' : 'text-neutral-300'
                                  }`}
                                >
                                  {hours ? hours % 1 === 0 ? `${hours}` : hours.toFixed(1) : '—'}
                                </td>
                              )
                            })}
                            <td className="py-2 pl-4 text-right font-mono text-xs font-semibold text-neutral-900">
                              {formatHours(rowTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-neutral-200">
                        <td className="pt-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                          Daily Total
                        </td>
                        {days.map((day, i) => {
                          const dateStr = format(day, 'yyyy-MM-dd')
                          const dayTotal = group.projectBreakdown.reduce(
                            (sum, p) => sum + (entryMap.get(`${p.projectId}:${dateStr}`) ?? 0),
                            0
                          )
                          return (
                            <td
                              key={i}
                              className={`pt-2 pb-1 text-center font-mono text-xs font-semibold ${
                                dayTotal > 0 ? 'text-neutral-900' : 'text-neutral-300'
                              }`}
                            >
                              {dayTotal > 0 ? formatHours(dayTotal) : '—'}
                            </td>
                          )
                        })}
                        <td className="pt-2 pb-1 pl-4 text-right font-mono text-xs font-bold text-neutral-900">
                          {formatHours(group.totalHours)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
