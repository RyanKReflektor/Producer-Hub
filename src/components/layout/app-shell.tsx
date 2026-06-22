import { Sidebar } from './sidebar'
import type { Profile } from '@/lib/types'

interface AppShellProps {
  profile: Profile
  children: React.ReactNode
}

export function AppShell({ profile, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar profile={profile} role={profile.role} />
      <main className="flex-1 overflow-y-auto bg-[#F8F8F8]">
        {children}
      </main>
    </div>
  )
}
