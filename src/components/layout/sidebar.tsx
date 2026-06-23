'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Clock,
  FolderOpen,
  Users,
  CheckSquare,
  Calendar,
  BarChart2,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from './theme-context'
import type { Profile } from '@/lib/types'

interface SidebarProps {
  profile: Profile
  role: 'producer' | 'contributor'
}

const producerNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/people', label: 'People', icon: Users },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare },
  { href: '/resourcing', label: 'Resourcing', icon: BarChart2 },
  { href: '/timeline', label: 'Timeline', icon: Calendar },
]

const contributorNav = [
  { href: '/timesheet', label: 'My Timesheet', icon: Clock },
]

export function Sidebar({ profile, role }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const nav = role === 'producer' ? producerNav : contributorNav

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-col h-full bg-[#0F0F0F] w-56 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Spectra" className="w-6 h-6 shrink-0 rounded-[2px]" />
        <span className="text-white font-semibold text-sm tracking-tight">Spectra</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-sm transition-colors ${
                isActive
                  ? 'bg-neutral-800 text-white border-l-2 border-[#3E0BE5] pl-[10px]'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Icon size={15} className="shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User profile */}
      <div className="border-t border-neutral-800 p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-[4px] bg-neutral-700 flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-neutral-300">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{profile.name}</p>
            <p className="text-neutral-500 text-xs capitalize">{profile.role}</p>
          </div>
        </div>
        <button
          onClick={toggle}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-neutral-500 hover:text-neutral-300 text-xs transition-colors rounded-[4px] hover:bg-neutral-900 mb-0.5"
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-neutral-500 hover:text-neutral-300 text-xs transition-colors rounded-[4px] hover:bg-neutral-900"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </div>
  )
}
