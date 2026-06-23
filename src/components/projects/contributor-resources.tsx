'use client'

import { useState, Fragment } from 'react'
import { ExternalLink, ChevronRight, ChevronDown } from 'lucide-react'
import { ToolIcon, toolLabel } from './tool-icons'
import type { LinkTool } from '@/lib/types'

interface ContributorLink {
  id: string
  tool: LinkTool
  label: string
  url: string
}

interface ContributorResourcesProps {
  links: ContributorLink[]
}

export function ContributorResources({ links }: ContributorResourcesProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())

  const toggleTool = (tool: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(tool)) next.delete(tool)
      else next.add(tool)
      return next
    })
  }

  if (links.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No resources have been added yet.</p>
      </div>
    )
  }

  // Group links by tool, preserving first-appearance order. Tools with more
  // than 2 links collapse into an accordion; 1–2 links render flat.
  const groups = (() => {
    const map = new Map<LinkTool, ContributorLink[]>()
    for (const link of links) {
      if (!map.has(link.tool)) map.set(link.tool, [])
      map.get(link.tool)!.push(link)
    }
    return Array.from(map.entries()).map(([tool, items]) => ({ tool, items }))
  })()

  function renderRow(link: ContributorLink, isChild = false) {
    return (
      <li
        key={link.id}
        className={`flex items-center gap-3 py-2.5 ${isChild ? 'pl-11 pr-4' : 'px-4'}`}
      >
        {!isChild && <ToolIcon tool={link.tool} size={14} />}
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
          {!isChild && (
            <p className="text-xs text-neutral-400 dark:text-[#555] truncate">{toolLabel(link.tool)}</p>
          )}
        </div>
      </li>
    )
  }

  return (
    <ul className="divide-y divide-neutral-100 dark:divide-[#222]">
      {groups.map(group => {
        if (group.items.length <= 2) {
          return group.items.map(link => renderRow(link))
        }
        const isExpanded = expandedTools.has(group.tool)
        return (
          <Fragment key={group.tool}>
            <li>
              <button
                type="button"
                onClick={() => toggleTool(group.tool)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] text-left"
              >
                {isExpanded
                  ? <ChevronDown size={14} className="shrink-0 text-neutral-400" />
                  : <ChevronRight size={14} className="shrink-0 text-neutral-400" />}
                <ToolIcon tool={group.tool} size={14} />
                <span className="text-sm font-medium text-neutral-900 dark:text-[#f0f0f0]">
                  {toolLabel(group.tool)}
                </span>
                <span className="text-xs text-neutral-400 dark:text-[#555]">
                  {group.items.length}
                </span>
              </button>
            </li>
            {isExpanded && group.items.map(link => renderRow(link, true))}
          </Fragment>
        )
      })}
    </ul>
  )
}
