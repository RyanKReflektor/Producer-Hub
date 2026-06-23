import { AppShellClient } from './app-shell-client'
import type { Profile } from '@/lib/types'

interface AppShellProps {
  profile: Profile
  children: React.ReactNode
}

export function AppShell({ profile, children }: AppShellProps) {
  return <AppShellClient profile={profile}>{children}</AppShellClient>
}
