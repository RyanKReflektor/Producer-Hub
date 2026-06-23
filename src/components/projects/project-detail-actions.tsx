'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ProjectForm } from './project-form'
import { Edit } from 'lucide-react'
import type { Project } from '@/lib/types'

interface ProjectDetailActionsProps {
  project: Project
}

export function ProjectDetailActions({ project }: ProjectDetailActionsProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white bg-transparent shrink-0">
          <Edit size={14} />
          Edit Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ProjectForm
          project={project}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
