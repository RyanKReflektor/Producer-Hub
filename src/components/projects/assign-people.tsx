'use client'

import { useState, useTransition } from 'react'
import { UserPlus, X } from 'lucide-react'
import { assignPersonToProject, removePersonFromProject } from '@/app/(producer)/projects/actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Profile, ProjectAssignment } from '@/lib/types'

interface AssignedPerson {
  assignment_id: string
  person_id: string
  name: string
  email: string
  person_type: string | null
  internal_rate_override: number | null
  external_rate_override: number | null
  default_internal_rate: number | null
  default_external_rate: number | null
}

interface AssignPeopleProps {
  projectId: string
  assigned: AssignedPerson[]
  available: Profile[]  // people not yet assigned
}

export function AssignPeople({ projectId, assigned, available }: AssignPeopleProps) {
  const [open, setOpen] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [internalRate, setInternalRate] = useState('')
  const [externalRate, setExternalRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedPerson = available.find(p => p.id === selectedPersonId)

  function handlePersonChange(id: string) {
    setSelectedPersonId(id)
    const person = available.find(p => p.id === id)
    // Pre-fill with defaults; leave blank if none (producer can override)
    setInternalRate(person?.internal_rate?.toString() ?? '')
    setExternalRate(person?.external_rate?.toString() ?? '')
  }

  function handleAdd() {
    if (!selectedPersonId) return
    setError(null)
    startTransition(async () => {
      try {
        await assignPersonToProject(
          projectId,
          selectedPersonId,
          internalRate ? Number(internalRate) : undefined,
          externalRate ? Number(externalRate) : undefined,
        )
        setOpen(false)
        setSelectedPersonId('')
        setInternalRate('')
        setExternalRate('')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to assign person')
      }
    })
  }

  function handleRemove(personId: string) {
    startTransition(async () => {
      await removePersonFromProject(projectId, personId)
    })
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-[4px] mb-6">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Assigned People</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={available.length === 0}
          className="flex items-center gap-1.5"
        >
          <UserPlus size={13} />
          Add Person
        </Button>
      </div>

      {assigned.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-400 text-center">
          No one assigned yet. Add people to let them log time to this project.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Internal $/hr</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">External $/hr</th>
              <th className="px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {assigned.map(person => {
              const iRate = person.internal_rate_override ?? person.default_internal_rate
              const eRate = person.external_rate_override ?? person.default_external_rate
              const hasOverride = person.internal_rate_override !== null || person.external_rate_override !== null
              return (
                <tr key={person.person_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2.5">
                    <div>
                      <p className="font-medium text-neutral-900">{person.name}</p>
                      <p className="text-xs text-neutral-400">{person.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 capitalize">
                    {person.person_type ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-neutral-700">
                    {iRate != null ? (
                      <span className={hasOverride && person.internal_rate_override !== null ? 'text-amber-600' : ''}>
                        ${Number(iRate).toFixed(2)}
                        {person.internal_rate_override !== null && (
                          <span className="text-xs text-amber-500 ml-1">override</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-neutral-700">
                    {eRate != null ? (
                      <span className={hasOverride && person.external_rate_override !== null ? 'text-amber-600' : ''}>
                        ${Number(eRate).toFixed(2)}
                        {person.external_rate_override !== null && (
                          <span className="text-xs text-amber-500 ml-1">override</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleRemove(person.person_id)}
                      disabled={isPending}
                      className="text-neutral-300 hover:text-red-500 transition-colors p-1 rounded"
                      title="Remove from project"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Person to Project</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select value={selectedPersonId} onValueChange={handlePersonChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a person..." />
                </SelectTrigger>
                <SelectContent>
                  {available.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.person_type ?? 'unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Internal Rate Override
                  <span className="text-neutral-400 font-normal ml-1">($/hr)</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={selectedPerson?.internal_rate?.toString() ?? 'Default'}
                  value={internalRate}
                  onChange={e => setInternalRate(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-neutral-400">Leave blank to use person's default rate</p>
              </div>
              <div className="space-y-1.5">
                <Label>
                  External Rate Override
                  <span className="text-neutral-400 font-normal ml-1">($/hr)</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={selectedPerson?.external_rate?.toString() ?? 'Default'}
                  value={externalRate}
                  onChange={e => setExternalRate(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-[4px] px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={!selectedPersonId || isPending}
              >
                {isPending ? 'Adding...' : 'Add to Project'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
