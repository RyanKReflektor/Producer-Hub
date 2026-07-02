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
import { createPerson, updatePerson } from '@/app/(producer)/people/actions'
import type { Profile } from '@/lib/types'

interface PersonFormProps {
  person?: Profile
  onSuccess?: () => void
}

export function PersonForm({ person, onSuccess }: PersonFormProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      try {
        if (person) {
          await updatePerson(person.id, formData)
        } else {
          await createPerson(formData)
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
        <DialogTitle>{person ? 'Edit Person' : 'Add Person'}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={person?.name}
              required
              placeholder="Jane Smith"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={person?.email}
              required={!person}
              disabled={!!person}
              placeholder="jane@company.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select name="role" defaultValue={person?.role ?? 'contributor'}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="producer">Producer</SelectItem>
                <SelectItem value="contributor">Contributor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person_type">Type</Label>
            <Select name="person_type" defaultValue={person?.person_type ?? ''}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="freelancer">Freelancer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Job Title / Role</Label>
          <Input
            id="title"
            name="title"
            defaultValue={person?.title ?? ''}
            placeholder="Designer, Developer, Project Manager…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={(person?.tags ?? []).join(', ')}
            placeholder="Designer, Sr, Motion, React (comma-separated)"
          />
          <p className="text-xs text-neutral-400">Skills, seniority, discipline — separate with commas. Unlimited.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="internal_rate">Internal Rate ($/hr)</Label>
            <Input
              id="internal_rate"
              name="internal_rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={person?.internal_rate ?? ''}
              placeholder="85.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="external_rate">External Rate ($/hr)</Label>
            <Input
              id="external_rate"
              name="external_rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={person?.external_rate ?? ''}
              placeholder="150.00"
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
          {isPending ? 'Saving...' : person ? 'Save Changes' : 'Add Person'}
        </Button>
      </DialogFooter>
    </form>
  )
}
