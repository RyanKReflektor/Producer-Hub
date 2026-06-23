import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { ToolIcon, toolLabel } from '@/components/projects/tool-icons'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On Hold',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const PERSON_TYPE_LABEL: Record<string, string> = {
  employee: 'Employee',
  freelancer: 'Freelancer',
}

interface PageProps {
  params: { id: string }
}

export default async function ContributorProjectPage({ params }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify the contributor is assigned to this project
  const { data: assignment } = await supabase
    .from('project_assignments')
    .select('id')
    .eq('project_id', params.id)
    .eq('person_id', user.id)
    .single()

  if (!assignment) notFound()

  const supabaseAdmin = createAdminClient()

  // Fetch project details — NO budget fields ever exposed to contributors
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, name, client, status, start_date, end_date')
    .eq('id', params.id)
    .single()

  if (!project) notFound()

  // Fetch links — RLS on createClient() filters producer_only = true links automatically
  const { data: links } = await supabase
    .from('project_links')
    .select('id, tool, label, url')
    .eq('project_id', params.id)
    .order('added_at', { ascending: true })

  // Fetch team members — only name and person_type, NO rate fields
  const { data: assignments } = await supabaseAdmin
    .from('project_assignments')
    .select('person_id, profiles!inner(name, person_type)')
    .eq('project_id', params.id)

  const teamMembers = (assignments || []).map(a => ({
    id: a.person_id,
    name: (a.profiles as any)?.name ?? 'Unknown',
    personType: (a.profiles as any)?.person_type as string | null,
  }))

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : null

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">{project.name}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{project.client}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLOR[project.status] ?? STATUS_COLOR.active}`}>
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
        </div>

        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-4 mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            {project.start_date && (
              <div>
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mr-1.5">Start</span>
                {formatDate(project.start_date)}
              </div>
            )}
            {project.end_date && (
              <div>
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mr-1.5">End</span>
                {formatDate(project.end_date)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline — Phase 2 placeholder */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">Timeline</h2>
        <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px] px-4 py-6 text-center">
          <p className="text-sm text-neutral-400 dark:text-neutral-500">Timeline coming in Phase 2.</p>
        </div>
      </section>

      {/* Resources */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">Resources</h2>
        <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px]">
          {!links || links.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-neutral-400 dark:text-neutral-500">No resources have been added yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-[#222]">
              {links.map(link => (
                <li key={link.id} className="flex items-center gap-3 px-4 py-2.5">
                  <ToolIcon tool={link.tool} size={14} />
                  <div className="flex-1 min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-neutral-900 dark:text-[#f0f0f0] hover:underline flex items-center gap-1 min-w-0"
                    >
                      <span className="truncate">{link.label}</span>
                      <ExternalLink size={11} className="shrink-0 text-neutral-400" />
                    </a>
                    <p className="text-xs text-neutral-400 dark:text-[#555] truncate">{toolLabel(link.tool)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Team */}
      <section>
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">Team</h2>
        <div className="bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#2a2a2a] rounded-[4px]">
          {teamMembers.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-neutral-400 dark:text-neutral-500">No team members assigned.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-[#222]">
              {teamMembers.map(member => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-[4px] bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-[#f0f0f0] truncate">{member.name}</p>
                    {member.personType && (
                      <p className="text-xs text-neutral-400 dark:text-[#555]">{PERSON_TYPE_LABEL[member.personType] ?? member.personType}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
