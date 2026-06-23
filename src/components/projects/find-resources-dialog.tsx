'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, Search } from 'lucide-react'
import { discoverResources, addProjectLink } from '@/app/(producer)/projects/[id]/links-actions'
import type { DiscoveryMatch, DiscoveryResult } from '@/app/(producer)/projects/[id]/links-actions'
import type { ProjectLink } from '@/lib/types'
import { ToolIcon, toolLabel } from './tool-icons'
import { useTheme } from '@/components/layout/theme-context'
import { cn } from '@/lib/utils'

interface FindResourcesDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
  clientName: string
  existingLinks: ProjectLink[]
  onLinksAdded: (links: ProjectLink[]) => void
}

type SelectionMap = Map<string, { match: DiscoveryMatch; label: string; selected: boolean }>

export function FindResourcesDialog({
  open,
  onClose,
  projectId,
  projectName,
  clientName,
  existingLinks,
  onLinksAdded,
}: FindResourcesDialogProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const defaultTerms = [projectName, clientName].filter(Boolean).join(', ')

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [searchTerms, setSearchTerms] = useState(defaultTerms)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [selection, setSelection] = useState<SelectionMap>(new Map())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function handleClose() {
    setStatus('idle')
    setResult(null)
    setSelection(new Map())
    setSaveError(null)
    setSearchTerms(defaultTerms)
    onClose()
  }

  function runSearch() {
    setStatus('loading')
    setResult(null)
    setSelection(new Map())
    setSaveError(null)

    const extra = searchTerms.split(',').map(t => t.trim()).filter(Boolean)

    const existingUrls = new Set(existingLinks.map(l => l.url))

    discoverResources(projectName, clientName, extra)
      .then(r => {
        const filtered = { ...r, matches: r.matches.filter(m => !existingUrls.has(m.url)) }
        setResult(filtered)
        const map: SelectionMap = new Map()
        filtered.matches.forEach(m => map.set(m.id, { match: m, label: m.label, selected: false }))
        setSelection(map)
        setStatus('done')
      })
      .catch(e => {
        setResult({ matches: [], unconfigured: [], errors: [{ service: 'Discovery', message: e.message }] })
        setStatus('error')
      })
  }

  const toggle = (id: string) => {
    setSelection(prev => {
      const next = new Map(prev)
      const item = next.get(id)
      if (item) next.set(id, { ...item, selected: !item.selected })
      return next
    })
  }

  const setLabel = (id: string, label: string) => {
    setSelection(prev => {
      const next = new Map(prev)
      const item = next.get(id)
      if (item) next.set(id, { ...item, label })
      return next
    })
  }

  const selectedItems = Array.from(selection.values()).filter(s => s.selected)

  async function handleSave() {
    if (selectedItems.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const added: ProjectLink[] = []
      for (const { match, label } of selectedItems) {
        const link = await addProjectLink(projectId, match.tool, label, match.url)
        added.push(link)
      }
      onLinksAdded(added)
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const grouped = result
    ? (['slack', 'notion', 'drive'] as const).map(tool => ({
        tool,
        items: result.matches.filter(m => m.tool === tool),
      })).filter(g => g.items.length > 0)
    : []

  const hasResults = status !== 'loading' && status !== 'idle' && result

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className={cn('max-w-lg max-h-[85vh]', dark && 'dark')}>
        <DialogHeader>
          <DialogTitle className="dark:text-white">Find Resources</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerms}
              onChange={e => setSearchTerms(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Add extra keywords separated by commas…"
              className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              disabled={status === 'loading'}
            />
          </div>
          <Button size="sm" onClick={runSearch} disabled={status === 'loading'} className="shrink-0">
            {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {status === 'loading' ? 'Searching…' : 'Search'}
          </Button>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 size={24} className="animate-spin text-neutral-400" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Searching Slack, Notion, and Drive…</p>
          </div>
        )}

        {status === 'idle' && (
          <div className="py-6 text-center">
            <p className="text-sm text-neutral-400">Enter search terms above and click Search.</p>
          </div>
        )}

        {hasResults && (
          <>
            {/* Scrollable results area */}
            <div className="overflow-y-auto min-h-0 space-y-4 flex-1 pr-1">
              {grouped.length > 0 ? (
                <div className="space-y-3">
                  {/* Select all / deselect all */}
                  {result!.matches.length > 0 && (() => {
                    const allSelected = result!.matches.every(m => selection.get(m.id)?.selected)
                    return (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelection(prev => {
                            const next = new Map(prev)
                            prev.forEach((v, k) => next.set(k, { ...v, selected: !allSelected }))
                            return next
                          })}
                          className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                        >
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                    )
                  })()}
                  {grouped.map(({ tool, items }) => (
                    <div key={tool}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <ToolIcon tool={tool} size={13} />
                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          {toolLabel(tool)}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {items.map(match => {
                          const sel = selection.get(match.id)
                          const isSelected = sel?.selected ?? false
                          return (
                            <label
                              key={match.id}
                              className={cn(
                                'flex items-start gap-3 p-2.5 rounded-[4px] border cursor-pointer transition-colors',
                                isSelected
                                  ? 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800'
                                  : 'border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40 opacity-60'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggle(match.id)}
                                className="mt-0.5 accent-neutral-900 dark:accent-neutral-100"
                              />
                              <div className="flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={sel?.label ?? match.label}
                                  onChange={e => setLabel(match.id, e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  className="w-full text-sm font-medium text-neutral-900 dark:text-neutral-100 bg-transparent border-none outline-none focus:underline"
                                />
                                <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">{match.url}</p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : result!.unconfigured.length < 3 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No matching resources found.</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">Try adding links manually instead.</p>
                </div>
              ) : null}

              {result!.errors.length > 0 && (
                <div className="space-y-1.5">
                  {result!.errors.map(e => (
                    <div key={e.service} className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-[4px] px-3 py-2">
                      <AlertCircle size={12} />
                      <span><strong>{e.service}:</strong> {e.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {result!.unconfigured.length > 0 && (
                <div className="border border-neutral-100 dark:border-neutral-700 rounded-[4px] p-3 bg-neutral-50 dark:bg-neutral-800">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Not configured</p>
                  <div className="space-y-1">
                    {result!.unconfigured.map(svc => (
                      <div key={svc} className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">{svc}</span>
                        <Badge variant="draft" className="text-[10px] py-0 font-mono">
                          {svc === 'Slack' ? 'SLACK_BOT_TOKEN' : svc === 'Notion' ? 'NOTION_API_KEY' : 'GOOGLE_SA_EMAIL + KEY'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-2">Add these to .env.local to enable discovery.</p>
                </div>
              )}

              {saveError && (
                <p className="text-xs text-red-600">{saveError}</p>
              )}
            </div>

            {/* Action buttons — pinned outside scroll area */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700 shrink-0">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || selectedItems.length === 0}
              >
                {saving
                  ? 'Saving…'
                  : selectedItems.length > 0
                  ? `Add ${selectedItems.length} resource${selectedItems.length !== 1 ? 's' : ''}`
                  : 'No items selected'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
