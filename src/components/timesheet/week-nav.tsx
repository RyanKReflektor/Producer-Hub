'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

interface WeekNavProps {
  monday: Date
  currentMonday: Date
  basePath?: string
}

export function WeekNav({ monday, currentMonday, basePath = '/timesheet' }: WeekNavProps) {
  const router = useRouter()

  const mondayTime = monday instanceof Date ? monday.getTime() : new Date(monday).getTime()
  const currentTime = currentMonday instanceof Date ? currentMonday.getTime() : new Date(currentMonday).getTime()
  const isCurrentWeek = mondayTime === currentTime

  const mondayDate = monday instanceof Date ? monday : new Date(monday)

  const sunday = new Date(mondayDate)
  sunday.setDate(mondayDate.getDate() + 6)

  function navigate(direction: 'prev' | 'next') {
    const newMonday = new Date(mondayDate)
    newMonday.setDate(mondayDate.getDate() + (direction === 'prev' ? -7 : 7))
    const dateStr = newMonday.toISOString().split('T')[0]
    router.push(`${basePath}?week=${dateStr}`)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate('prev')}
        className="p-1.5 hover:bg-neutral-100 rounded-[4px] transition-colors"
      >
        <ChevronLeft size={16} className="text-neutral-600" />
      </button>

      <div className="text-center min-w-[160px]">
        <div className="text-sm font-medium text-neutral-900">
          {format(mondayDate, 'MMM d')} &ndash; {format(sunday, 'MMM d, yyyy')}
        </div>
        {isCurrentWeek && (
          <div className="text-xs text-[#3E0BE5] font-medium">This week</div>
        )}
      </div>

      <button
        onClick={() => navigate('next')}
        className="p-1.5 hover:bg-neutral-100 rounded-[4px] transition-colors"
      >
        <ChevronRight size={16} className="text-neutral-600" />
      </button>

      {!isCurrentWeek && (
        <button
          onClick={() => router.push(basePath)}
          className="text-xs text-[#3E0BE5] hover:text-purple-700 font-medium ml-1"
        >
          Today
        </button>
      )}
    </div>
  )
}
