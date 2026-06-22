import { Calendar } from 'lucide-react'

export default function TimelinePage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-900">Timeline</h1>
        <p className="text-sm text-neutral-500 mt-1">Project milestones and Gantt view</p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-[4px] p-12 text-center">
        <Calendar size={40} className="mx-auto text-neutral-300 mb-4" />
        <h2 className="text-lg font-semibold text-neutral-900 mb-2">Coming in Phase 2</h2>
        <p className="text-sm text-neutral-500 max-w-md mx-auto mb-6">
          The timeline view will show project milestones and a Gantt-style view of project schedules.
          Milestone data model is ready.
        </p>
        {/* Skeleton Gantt */}
        <div className="space-y-3 max-w-2xl mx-auto opacity-30 text-left">
          <div className="flex gap-2 mb-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-1 h-6 bg-neutral-100 rounded-[4px]" />
            ))}
          </div>
          {[
            { left: '0%', width: '60%' },
            { left: '10%', width: '40%' },
            { left: '5%', width: '80%' },
            { left: '20%', width: '50%' },
          ].map((bar, i) => (
            <div key={i} className="flex items-center gap-3 h-8">
              <div className="w-24 h-5 bg-neutral-200 rounded-[4px] shrink-0" />
              <div className="flex-1 relative h-5">
                <div
                  className="absolute h-full bg-neutral-300 rounded-[4px]"
                  style={{ left: bar.left, width: bar.width }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
