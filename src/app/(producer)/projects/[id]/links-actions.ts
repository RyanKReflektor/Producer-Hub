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
  extraTerms: string[] = [],
): Promise<DiscoveryResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const matches: DiscoveryMatch[] = []
  const unconfigured: string[] = []
  const errors: { service: string; message: string }[] = []

  const [slackResult, notionResult, driveResult] = await Promise.allSettled([
    process.env.SLACK_BOT_TOKEN
      ? searchSlack(projectName, clientName, process.env.SLACK_BOT_TOKEN, extraTerms)
      : Promise.reject(new Error('__UNCONFIGURED__')),
    process.env.NOTION_API_KEY
      ? searchNotion(projectName, clientName, process.env.NOTION_API_KEY)
      : Promise.reject(new Error('__UNCONFIGURED__')),
    process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY
      ? searchDrive(projectName, process.env.GOOGLE_SA_EMAIL, process.env.GOOGLE_SA_PRIVATE_KEY)
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
  extraTerms: string[] = [],
): Promise<DiscoveryMatch[]> {
  const [teamRes, channels] = await Promise.all([
    fetch('https://slack.com/api/team.info', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    fetchAllSlackChannels(token),
  ])

  const domain: string | undefined = teamRes.team?.domain
  const terms = [...buildTerms(projectName, clientName), ...extraTerms.map(t => t.toLowerCase().trim()).filter(Boolean)]

  return channels
    .filter(c => terms.some(t => (c.name as string).toLowerCase().includes(t)))
    .slice(0, 5)
    .map(c => ({
      id: `slack-${c.id}`,
      tool: 'slack' as const,
      label: `#${c.name}`,
      url: domain
        ? `https://${domain}.slack.com/archives/${c.id}`
        : `https://slack.com/archives/${c.id}`,
    }))
}

async function fetchAllSlackChannels(token: string): Promise<any[]> {
  const all: any[] = []
  let cursor: string | undefined

  // Page through up to 10,000 channels (10 pages × 1,000)
  for (let page = 0; page < 10; page++) {
    const url = new URL('https://slack.com/api/conversations.list')
    url.searchParams.set('limit', '1000')
    url.searchParams.set('types', 'public_channel,private_channel')
    url.searchParams.set('exclude_archived', 'true')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())

    if (!res.ok) throw new Error(res.error ?? 'Slack API error')
    all.push(...(res.channels ?? []))

    cursor = res.response_metadata?.next_cursor
    if (!cursor) break
  }

  return all
}

async function searchNotion(projectName: string, clientName: string, key: string): Promise<DiscoveryMatch[]> {
  const query = clientName ? `${projectName} ${clientName}` : projectName
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, page_size: 5 }),
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

async function searchDrive(
  projectName: string,
  saEmail: string,
  saPrivateKey: string,
): Promise<DiscoveryMatch[]> {
  const token = await getDriveAccessToken(saEmail, saPrivateKey)
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

async function getDriveAccessToken(saEmail: string, saPrivateKey: string): Promise<string> {
  // Unescape \n from env var storage
  const privateKey = saPrivateKey.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: saEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const { createSign } = await import('crypto')
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(privateKey, 'base64url')

  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  }).then(r => r.json())

  if (!res.access_token) throw new Error(res.error_description ?? 'Failed to get Drive token')
  return res.access_token
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTerms(projectName: string, clientName: string): string[] {
  const terms = new Set<string>()
  const add = (s: string) => {
    const lower = s.toLowerCase()
    terms.add(lower)
    terms.add(lower.replace(/\s+/g, '-'))
    terms.add(lower.replace(/\s+/g, '_'))
    lower.split(/\s+/).filter(w => w.length >= 5).forEach(w => terms.add(w))
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
