'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProjectLink, LinkTool } from '@/lib/types'

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function addProjectLink(
  projectId: string,
  tool: LinkTool,
  label: string,
  url: string,
): Promise<ProjectLink> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('project_links')
    .insert({ project_id: projectId, tool, label, url, added_by: user.id })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  return data as ProjectLink
}

export async function updateProjectLink(
  id: string,
  label: string,
  url: string,
  projectId: string,
): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('project_links')
    .update({ label, url })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteProjectLink(id: string, projectId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase.from('project_links').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export type DiscoveryMatch = {
  id: string
  tool: 'slack' | 'notion' | 'drive'
  label: string
  url: string
}

export type DiscoveryResult = {
  matches: DiscoveryMatch[]
  unconfigured: string[]
  errors: { service: string; message: string }[]
}

export async function discoverResources(
  projectName: string,
  clientName: string,
): Promise<DiscoveryResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const matches: DiscoveryMatch[] = []
  const unconfigured: string[] = []
  const errors: { service: string; message: string }[] = []

  const [slackResult, notionResult, driveResult] = await Promise.allSettled([
    process.env.SLACK_BOT_TOKEN
      ? searchSlack(projectName, clientName, process.env.SLACK_BOT_TOKEN)
      : Promise.reject(new Error('__UNCONFIGURED__')),
    process.env.NOTION_API_KEY
      ? searchNotion(projectName, process.env.NOTION_API_KEY)
      : Promise.reject(new Error('__UNCONFIGURED__')),
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN
      ? searchDrive(projectName, process.env.GOOGLE_DRIVE_ACCESS_TOKEN)
      : Promise.reject(new Error('__UNCONFIGURED__')),
  ])

  for (const [label, result] of [
    ['Slack', slackResult],
    ['Notion', notionResult],
    ['Google Drive', driveResult],
  ] as [string, PromiseSettledResult<DiscoveryMatch[]>][]) {
    if (result.status === 'fulfilled') {
      matches.push(...result.value)
    } else if (result.reason?.message === '__UNCONFIGURED__') {
      unconfigured.push(label)
    } else {
      errors.push({ service: label, message: result.reason?.message ?? 'Search failed' })
    }
  }

  return { matches, unconfigured, errors }
}

// ─── Per-service search helpers ───────────────────────────────────────────────

async function searchSlack(
  projectName: string,
  clientName: string,
  token: string,
): Promise<DiscoveryMatch[]> {
  const [teamRes, channelRes] = await Promise.all([
    fetch('https://slack.com/api/team.info', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    fetch(
      'https://slack.com/api/conversations.list?limit=1000&types=public_channel,private_channel&exclude_archived=true',
      { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json()),
  ])

  if (!channelRes.ok) throw new Error(channelRes.error ?? 'Slack API error')

  const domain: string | undefined = teamRes.team?.domain
  const terms = buildTerms(projectName, clientName)

  return ((channelRes.channels ?? []) as any[])
    .filter(c => terms.some(t => (c.name as string).toLowerCase().includes(t)))
    .slice(0, 3)
    .map(c => ({
      id: `slack-${c.id}`,
      tool: 'slack' as const,
      label: `#${c.name}`,
      url: domain
        ? `https://${domain}.slack.com/archives/${c.id}`
        : `https://slack.com/archives/${c.id}`,
    }))
}

async function searchNotion(projectName: string, key: string): Promise<DiscoveryMatch[]> {
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: projectName, page_size: 5 }),
  }).then(r => r.json())

  if (res.status === 401) throw new Error('Invalid Notion API key')
  if (res.object === 'error') throw new Error(res.message ?? 'Notion API error')

  return ((res.results ?? []) as any[]).slice(0, 3).map(p => ({
    id: `notion-${p.id}`,
    tool: 'notion' as const,
    label: notionTitle(p),
    url: p.url,
  }))
}

async function searchDrive(projectName: string, token: string): Promise<DiscoveryMatch[]> {
  const escaped = projectName.replace(/'/g, "\\'")
  const q = encodeURIComponent(`fullText contains '${escaped}' and trashed = false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=5&fields=files(id,name,webViewLink)`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then(r => r.json())

  if (res.error) throw new Error(res.error.message ?? 'Drive API error')

  return ((res.files ?? []) as any[]).slice(0, 3).map(f => ({
    id: `drive-${f.id}`,
    tool: 'drive' as const,
    label: f.name,
    url: f.webViewLink,
  }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTerms(projectName: string, clientName: string): string[] {
  const terms = new Set<string>()
  const add = (s: string) => {
    const lower = s.toLowerCase()
    terms.add(lower)
    terms.add(lower.replace(/\s+/g, '-'))
    terms.add(lower.replace(/\s+/g, '_'))
    lower.split(/\s+/).filter(w => w.length >= 3).forEach(w => terms.add(w))
  }
  add(projectName)
  if (clientName) add(clientName)
  return Array.from(terms)
}

function notionTitle(page: any): string {
  const props = page.properties ?? {}
  for (const key of ['Name', 'name', 'title', 'Title']) {
    const val = props[key]?.title?.[0]?.plain_text
    if (val) return val
  }
  return page.object === 'database' ? 'Untitled database' : 'Untitled page'
}
