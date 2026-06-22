'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { approveEntries, rejectEntries } from '@/app/(producer)/approvals/actions'
import { Check, X } from 'lucide-react'

interface ApproveActionsProps {
  entryIds: string[]
  onComplete?: () => void
}

export function ApproveActions({ entryIds, onComplete }: ApproveActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleApprove() {
    startTransition(async () => {
      await approveEntries(entryIds)
      setDone(true)
      onComplete?.()
    })
  }

  function handleReject() {
    startTransition(async () => {
      await rejectEntries(entryIds)
      setDone(true)
      onComplete?.()
    })
  }

  if (done) {
    return <span className="text-xs text-neutral-400">Done</span>
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleApprove}
        disabled={isPending}
        className="text-green-700 border-green-200 hover:bg-green-50 h-7 text-xs px-2"
      >
        <Check size={12} />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleReject}
        disabled={isPending}
        className="text-red-700 border-red-200 hover:bg-red-50 h-7 text-xs px-2"
      >
        <X size={12} />
        Reject
      </Button>
    </div>
  )
}
