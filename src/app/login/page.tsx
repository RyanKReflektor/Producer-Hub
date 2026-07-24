'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profile?.role === 'contributor') {
        router.push('/timesheet')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setResetSent(true)
  }

  return (
    <div className="flex h-screen">
      {/* Left panel - dark branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0F0F0F] flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Spectra" className="w-8 h-8 rounded-[2px]" />
            <span className="text-white font-semibold text-xl tracking-tight">Spectra</span>
          </div>
          <h1 className="text-white text-4xl font-bold leading-tight mb-4">
            Time tracking for<br />production teams.
          </h1>
          <p className="text-neutral-400 text-lg">
            Track hours, manage budgets, and keep projects on time.
          </p>
        </div>
        <div className="text-neutral-600 text-sm">
          &copy; 2024 Spectra. All rights reserved.
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Spectra" className="w-6 h-6 rounded-[2px]" />
            <span className="font-semibold text-lg">Spectra</span>
          </div>

          <h2 className="text-2xl font-bold text-neutral-900 mb-2">
            {mode === 'signin' ? 'Sign in' : 'Reset password'}
          </h2>
          <p className="text-neutral-500 text-sm mb-8">
            {mode === 'signin'
              ? 'Enter your credentials to access your account'
              : 'Enter your email and we’ll send you a link to set a new password.'}
          </p>

          {mode === 'reset' && resetSent ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-[4px] text-green-700 text-sm">
                If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way. Check your inbox (and spam).
              </div>
              <button
                onClick={() => { setMode('signin'); setResetSent(false); setError(null) }}
                className="text-sm text-[#3E0BE5] hover:underline font-medium"
              >
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={mode === 'signin' ? handleLogin : handleReset} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  placeholder="you@company.com"
                />
              </div>

              {mode === 'signin' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setMode('reset'); setError(null) }}
                      className="text-xs text-[#3E0BE5] hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-neutral-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[4px] text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-neutral-900 text-white text-sm font-medium rounded-[4px] hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? (mode === 'signin' ? 'Signing in...' : 'Sending...')
                  : (mode === 'signin' ? 'Sign in' : 'Send reset link')}
              </button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(null) }}
                  className="text-sm text-neutral-500 hover:text-neutral-800 font-medium"
                >
                  ← Back to sign in
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
