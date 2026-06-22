'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createProject, updateProject } from '@/app/(producer)/projects/actions'
import type { Project } from '@/lib/types'

interface ProjectFormProps {
  project?: Project
  onSuccess?: () => void
}

export function ProjectForm({ project, onSuccess }: ProjectFormProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [budgetType, setBudgetType] = useState(project?.budget_type ?? '')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      try {
        if (project) {
          await updateProject(project.id, formData)
        } else {
          await createProject(formData)
        }
        onSuccess?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{project ? 'Edit Project' : 'New Project'}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={project?.name}
              required
              placeholder="Brand Campaign Q1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client">Client</Label>
            <Input
              id="client"
              name="client"
              defaultValue={project?.client}
              required
              placeholder="Acme Corp"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={project?.status ?? 'active'}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select name="currency" defaultValue={project?.currency ?? 'CAD'}>
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="start_date">Start Date</Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={project?.start_date ?? ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end_date">End Date</Label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              defaultValue={project?.end_date ?? ''}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="budget_type">Budget Type</Label>
            <Select
              name="budget_type"
              defaultValue={project?.budget_type ?? ''}
              onValueChange={v => setBudgetType(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No budget" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="dollars">Dollars</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget_value">
              Budget {budgetType === 'hours' ? '(hours)' : budgetType === 'dollars' ? '($)' : ''}
            </Label>
            <Input
              id="budget_value"
              name="budget_value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={project?.budget_value ?? ''}
              placeholder={budgetType ? (budgetType === 'hours' ? '160' : '25000') : 'Select type first'}
              disabled={!budgetType}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-[4px] text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : project ? 'Save Changes' : 'Create Project'}
        </Button>
      </DialogFooter>
    </form>
  )
}
