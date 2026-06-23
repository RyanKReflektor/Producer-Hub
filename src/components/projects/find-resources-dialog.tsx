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

interface FindResourcesDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
  clientName: string
  onLinksAdded: (links: ProjectLink[]) => void
}

type SelectionMap = Map<string, { match: DiscoveryMatch; label: string; selected: boolean }>

export function FindResourcesDialog({
  open,
  onClose,
  projectId,
  projectName,
  clientName,
  onLinksAdded,
}: FindResourcesDialogProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [searchTerms, setSearchTerms] = useState('')
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [selection, setSelection] = useState<SelectionMap>(new Map())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function handleClose() {
    setStatus('idle')
    setResult(null)
    setSelection(new Map())
    setSaveError(null)
    setSearchTerms('')
    onClose()
  }

  function runSearch() {
    setStatus('loading')
    setResult(null)
    setSelection(new Map())
    setSaveError(null)

    const extra = searchTerms.split(',').map(t => t.trim()).filter(Boolean)

    discoverResources(projectName, clientName, extra)
      .then(r => {
        setResult(r)
        const map: SelectionMap = new Map()
        r.matches.forEach(m => map.set(m.id, { match: m, label: m.label, selected: true }))
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

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Find Resources</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerms}
              onChange={e => setSearchTerms(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder={`${projectName}, ${clientName} (add extra keywords separated by commas)`}
              className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900"
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
            <p className="text-sm text-neutral-500">Searching Slack, Notion, and Drive…</p>
          </div>
        )}

        {status === 'idle' && (
          <div className="py-6 text-center">
            <p className="text-sm text-neutral-400">Enter search terms above and click Search.</p>
          </div>
        )}

        {status !== 'loading' && status !== 'idle' && result && (
          <div className="space-y-4">
            {/* Results */}
            {grouped.length > 0 ? (
              <div className="space-y-3">
                {grouped.map(({ tool, items }) => (
                  <div key={tool}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ToolIcon tool={tool} size={13} />
                      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
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
                            className={`flex items-start gap-3 p-2.5 rounded-[4px] border cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-neutral-300 bg-white'
                                : 'border-neutral-100 bg-neutral-50 opacity-60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(match.id)}
                              className="mt-0.5 accent-neutral-900"
                            />
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={sel?.label ?? match.label}
                                onChange={e => setLabel(match.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="w-full text-sm font-medium text-neutral-900 bg-transparent border-none outline-none focus:underline"
                              />
                              <p className="text-xs text-neutral-400 truncate mt-0.5">{match.url}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : result.unconfigured.length < 3 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-neutral-500">No matching resources found.</p>
                <p className="text-xs text-neutral-400 mt-1">Try adding links manually instead.</p>
              </div>
            ) : null}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="space-y-1.5">
                {result.errors.map(e => (
                  <div key={e.service} className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-[4px] px-3 py-2">
                    <AlertCircle size={12} />
                    <span><strong>{e.service}:</strong> {e.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Not configured */}
            {result.unconfigured.length > 0 && (
              <div className="border border-neutral-100 rounded-[4px] p-3 bg-neutral-50">
                <p className="text-xs font-medium text-neutral-500 mb-2">Not configured</p>
                <div className="space-y-1">
                  {result.unconfigured.map(svc => (
                    <div key={svc} className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">{svc}</span>
                      <Badge variant="draft" className="text-[10px] py-0 font-mono">
                        {svc === 'Slack' ? 'SLACK_BOT_TOKEN' : svc === 'Notion' ? 'NOTION_API_KEY' : 'GOOGLE_SA_EMAIL + KEY'}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-neutral-400 mt-2">Add these to .env.local to enable discovery.</p>
              </div>
            )}

            {saveError && (
              <p className="text-xs text-red-600">{saveError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
