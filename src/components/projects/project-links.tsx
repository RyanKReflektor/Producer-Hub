'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Sparkles, Pencil, Trash2, ExternalLink } from 'lucide-react'
import {
  addProjectLink,
  updateProjectLink,
  deleteProjectLink,
} from '@/app/(producer)/projects/[id]/links-actions'
import { FindResourcesDialog } from './find-resources-dialog'
import { ToolIcon, toolLabel } from './tool-icons'
import type { ProjectLink, LinkTool } from '@/lib/types'

const TOOLS: LinkTool[] = ['slack', 'notion', 'drive', 'other']

interface ProjectLinksProps {
  projectId: string
  projectName: string
  clientName: string
  initialLinks: ProjectLink[]
  isProducer: boolean
}

export function ProjectLinks({
  projectId,
  projectName,
  clientName,
  initialLinks,
  isProducer,
}: ProjectLinksProps) {
  const [links, setLinks] = useState<ProjectLink[]>(initialLinks)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectLink | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  // ── Add dialog ──────────────────────────────────────────────────────────────

  function handleOpenAdd() {
    setFormError(null)
    setAddOpen(true)
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const tool = fd.get('tool') as LinkTool
    const label = (fd.get('label') as string).trim()
    const url = (fd.get('url') as string).trim()
    if (!label || !url) return
    setFormError(null)
    startTransition(async () => {
      try {
        const link = await addProjectLink(projectId, tool, label, url)
        setLinks(prev => [...prev, link])
        setAddOpen(false)
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to add link')
      }
    })
  }

  // ── Edit dialog ─────────────────────────────────────────────────────────────

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editTarget) return
    const fd = new FormData(e.currentTarget)
    const label = (fd.get('label') as string).trim()
    const url = (fd.get('url') as string).trim()
    if (!label || !url) return
    setFormError(null)
    startTransition(async () => {
      try {
        await updateProjectLink(editTarget.id, label, url, projectId)
        setLinks(prev =>
          prev.map(l => (l.id === editTarget.id ? { ...l, label, url } : l))
        )
        setEditTarget(null)
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to update link')
      }
    })
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteProjectLink(id, projectId)
        setLinks(prev => prev.filter(l => l.id !== id))
        setDeleteId(null)
      } catch {
        // silent — link stays in list
      }
    })
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-[4px] mb-6 dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-100 dark:border-[#222] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-[#f0f0f0]">Resources</h2>
        {isProducer && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => setFindOpen(true)}
            >
              <Sparkles size={12} />
              Find Resources
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={handleOpenAdd}
            >
              <Plus size={12} />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Link list */}
      {links.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-[#6e6e6e]">No resources linked yet.</p>
          {isProducer && (
            <p className="text-xs text-neutral-400 dark:text-[#555] mt-1">
              Use <strong>Find Resources</strong> to search Slack, Notion, and Drive, or add a link manually.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-[#222]">
          {links.map(link => (
            <li
              key={link.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] group"
            >
              <ToolIcon tool={link.tool} size={14} />
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
                <p className="text-xs text-neutral-400 dark:text-[#555] truncate">{toolLabel(link.tool)}</p>
              </div>
              {isProducer && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setFormError(null); setEditTarget(link) }}
                    className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 rounded"
                    aria-label="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteId(link.id)}
                    className="p-1 text-neutral-400 hover:text-red-600 rounded"
                    aria-label="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add dialog */}
      <LinkFormDialog
        open={addOpen}
        title="Add Resource"
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
        isPending={isPending}
        error={formError}
      />

      {/* Edit dialog */}
      <LinkFormDialog
        open={!!editTarget}
        title="Edit Resource"
        defaultTool={editTarget?.tool}
        defaultLabel={editTarget?.label}
        defaultUrl={editTarget?.url}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        isPending={isPending}
        error={formError}
        hideTool
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove resource?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-500">This will permanently remove the link from this project.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={isPending}
            >
              {isPending ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Find Resources dialog */}
      <FindResourcesDialog
        open={findOpen}
        onClose={() => setFindOpen(false)}
        projectId={projectId}
        projectName={projectName}
        clientName={clientName}
        existingLinks={links}
        onLinksAdded={added => setLinks(prev => [...prev, ...added])}
      />
    </div>
  )
}

// ── Shared form dialog ────────────────────────────────────────────────────────

function LinkFormDialog({
  open,
  title,
  defaultTool = 'other',
  defaultLabel = '',
  defaultUrl = '',
  onClose,
  onSubmit,
  isPending,
  error,
  hideTool = false,
}: {
  open: boolean
  title: string
  defaultTool?: LinkTool
  defaultLabel?: string
  defaultUrl?: string
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isPending: boolean
  error: string | null
  hideTool?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          {!hideTool && (
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Tool</label>
              <select
                name="tool"
                defaultValue={defaultTool}
                className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white"
              >
                {TOOLS.map(t => (
                  <option key={t} value={t}>{toolLabel(t)}</option>
                ))}
              </select>
            </div>
          )}
          {hideTool && <input type="hidden" name="tool" value={defaultTool} />}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Label</label>
            <input
              name="label"
              type="text"
              defaultValue={defaultLabel}
              required
              placeholder="e.g. Project Brief, Assets Folder"
              className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">URL</label>
            <input
              name="url"
              type="url"
              defaultValue={defaultUrl}
              required
              placeholder="https://"
              className="w-full text-sm border border-neutral-200 rounded-[4px] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
