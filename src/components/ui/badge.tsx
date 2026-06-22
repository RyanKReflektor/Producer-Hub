import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-neutral-200 bg-neutral-100 text-neutral-700',
        draft: 'border-neutral-200 bg-neutral-100 text-neutral-600',
        submitted: 'border-blue-200 bg-blue-50 text-blue-700',
        approved: 'border-green-200 bg-green-50 text-green-700',
        rejected: 'border-red-200 bg-red-50 text-red-700',
        active: 'border-green-200 bg-green-50 text-green-700',
        completed: 'border-neutral-200 bg-neutral-100 text-neutral-600',
        on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
