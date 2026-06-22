'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { PersonForm } from './person-form'
import { togglePersonActive } from '@/app/(producer)/people/actions'
import { Plus, Edit } from 'lucide-react'
import type { Profile } from '@/lib/types'

interface PeopleActionsProps {
  person?: Profile
}

export function PeopleActions({ person }: PeopleActionsProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggleActive() {
    if (!person) return
    startTransition(async () => {
      await togglePersonActive(person.id, !person.active)
    })
  }

  // Add button (no person)
  if (!person) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus size={15} />
            Add Person
          </Button>
        </DialogTrigger>
        <DialogContent>
          <PersonForm onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    )
  }

  // Row actions (with person)
  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors p-1 rounded-[4px] hover:bg-neutral-100">
            <Edit size={13} />
          </button>
        </DialogTrigger>
        <DialogContent>
          <PersonForm
            person={person}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <button
        onClick={handleToggleActive}
        disabled={isPending}
        className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors px-2 py-1 rounded-[4px] hover:bg-neutral-100 disabled:opacity-50"
      >
        {person.active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  )
}
