import { BarChart2 } from 'lucide-react'

export default function ResourcingPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-900">Resourcing</h1>
        <p className="text-sm text-neutral-500 mt-1">Weekly capacity planning and resource allocation</p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-[4px] p-12 text-center">
        <BarChart2 size={40} className="mx-auto text-neutral-300 mb-4" />
        <h2 className="text-lg font-semibold text-neutral-900 mb-2">Coming in Phase 2</h2>
        <p className="text-sm text-neutral-500 max-w-md mx-auto mb-6">
          The resourcing grid will show weekly capacity vs. planned hours per person across all projects.
          The data model is already in place.
        </p>
        <div className="grid grid-cols-4 gap-3 max-w-2xl mx-auto opacity-30">
          <div className="col-span-1 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-neutral-200 rounded-[4px]" />
            ))}
          </div>
          <div className="col-span-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-8 bg-neutral-100 rounded-[4px]"
                    style={{ opacity: Math.random() > 0.5 ? 1 : 0.3 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
