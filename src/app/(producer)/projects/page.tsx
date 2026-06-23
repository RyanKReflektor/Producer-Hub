'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProjectForm } from '@/components/projects/project-form'
import type { Project, ProjectStatus } from '@/lib/types'
import { format } from 'date-fns'

function StatusBadge({ status }: { status: ProjectStatus }) {
  const variantMap: Record<ProjectStatus, 'active' | 'completed' | 'on_hold'> = {
    active: 'active',
    completed: 'completed',
    on_hold: 'on_hold',
  }
  const labels: Record<ProjectStatus, string> = {
    active: 'Active',
    completed: 'Completed',
    on_hold: 'On Hold',
  }
  return <Badge variant={variantMap[status]}>{labels[status]}</Badge>
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  async function fetchProjects() {
    const supabase = createClient()
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false })
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }
    const { data } = await query
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const filters: Array<{ value: ProjectStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
  ]

  return (
    <>
      <div className="bg-[#0F0F0F] px-8 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-6xl font-light text-white leading-none tracking-tight">Projects</h1>
            <div className="mt-5 flex items-center gap-4">
              <div className="w-8 h-px bg-neutral-700" />
              <p className="text-sm text-neutral-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white bg-transparent shrink-0">
                <Plus size={15} />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <ProjectForm
                onSuccess={() => {
                  setDialogOpen(false)
                  fetchProjects()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    <div className="p-8">

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-neutral-100 p-1 rounded-[4px] w-fit">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-[4px] text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-[4px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-neutral-500 py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-neutral-500 py-8">
                  No projects found.
                </TableCell>
              </TableRow>
            ) : (
              projects.map(project => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-neutral-900 hover:text-amber-600 transition-colors"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-neutral-600">{project.client}</TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="text-neutral-600 font-mono text-xs">
                    {project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—'}
                  </TableCell>
                  <TableCell className="text-neutral-600 font-mono text-xs">
                    {project.end_date ? format(new Date(project.end_date), 'MMM d, yyyy') : '—'}
                  </TableCell>
                  <TableCell className="text-neutral-600 font-mono text-xs">
                    {project.budget_value
                      ? `${project.budget_value.toLocaleString()} ${project.budget_type === 'hours' ? 'hrs' : project.currency}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                      View →
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
    </>
  )
}
