import { Hash, FileText, HardDrive, Link } from 'lucide-react'
import type { LinkTool } from '@/lib/types'

export function toolLabel(tool: LinkTool | string): string {
  switch (tool) {
    case 'slack': return 'Slack'
    case 'notion': return 'Notion'
    case 'drive': return 'Google Drive'
    default: return 'Link'
  }
}

export function ToolIcon({ tool, size = 14 }: { tool: LinkTool | string; size?: number }) {
  switch (tool) {
    case 'slack':
      return <Hash size={size} className="text-[#4A154B] shrink-0" />
    case 'notion':
      return <FileText size={size} className="text-neutral-800 shrink-0" />
    case 'drive':
      return <HardDrive size={size} className="text-[#1967D2] shrink-0" />
    default:
      return <Link size={size} className="text-neutral-400 shrink-0" />
  }
}
