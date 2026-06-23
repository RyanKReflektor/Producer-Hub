'use client'

import { useRouter, usePathname } from 'next/navigation'

interface ProjectTabNavProps {
  activeTab: string
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
]

export function ProjectTabNav({ activeTab }: ProjectTabNavProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex border-b border-neutral-200 mb-6">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => router.push(`${pathname}?tab=${id}`)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === id
              ? 'border-[#3E0BE5] text-[#3E0BE5]'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
