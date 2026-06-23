'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { ThemeContext, type Theme } from './theme-context'
import type { Profile } from '@/lib/types'

interface AppShellClientProps {
  profile: Profile
  children: React.ReactNode
}

export function AppShellClient({ profile, children }: AppShellClientProps) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const stored = localStorage.getItem('ph-theme') as Theme | null
    if (stored === 'dark' || stored === 'light') setTheme(stored)
  }, [])

  const toggle = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('ph-theme', next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar profile={profile} role={profile.role} />
        <main className={`flex-1 overflow-y-auto ${theme === 'dark' ? 'dark bg-[#111111]' : 'bg-[#F8F8F8]'}`}>
          {children}
        </main>
      </div>
    </ThemeContext.Provider>
  )
}
