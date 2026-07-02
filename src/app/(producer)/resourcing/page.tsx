export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { ResourcingTimeline } from '@/components/resourcing/resourcing-timeline'
import type { Profile, Project, ResourceAllocation, TimeOff } from '@/lib/types'

export default async function ResourcingPage() {
  const supabase = createAdminClient()

  const [{ data: people }, { data: projects }, { data: allocations }, { data: timeOff }] = await Promise.all([
    supabase.from('profiles').select('*').eq('active', true).order('name'),
    supabase.from('projects').select('*').not('status', 'eq', 'completed').order('name'),
    supabase.from('resource_allocations').select('*'),
    supabase.from('time_off').select('*'),
  ])

  return (
    <>
      <div className="bg-[#0F0F0F] px-8 py-12">
        <h1 className="text-6xl font-light text-white leading-none tracking-tight">Resourcing</h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="w-8 h-px bg-neutral-700" />
          <p className="text-sm text-neutral-500">Team scheduling and project allocation</p>
        </div>
      </div>
      <div className="p-8">
        <ResourcingTimeline
          people={(people ?? []) as Profile[]}
          projects={(projects ?? []) as Project[]}
          initialAllocations={(allocations ?? []) as ResourceAllocation[]}
          initialTimeOff={(timeOff ?? []) as TimeOff[]}
        />
      </div>
    </>
  )
}
