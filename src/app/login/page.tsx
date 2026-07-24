'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { registerReflektorUser } from './actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'reset' | 'register'>('signin')
  const [resetSent, setResetSent] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const router = useRouter()

  // React doesn't reliably set the `muted` attribute on the DOM element, which
  // causes browsers to block autoplay. Force it muted and kick off playback.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = true
    const attempt = video.play()
    if (attempt) attempt.catch(() => {})
  }, [])

  async function routeByRole(supabase: ReturnType<typeof createClient>, userId: string) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    router.push(profile?.role === 'contributor' ? '/timesheet' : '/dashboard')
    router.refresh()
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await registerReflektorUser(name, email, password)
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) await routeByRole(supabase, data.user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.')
      setLoading(false)
    }
  }

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
      {/* Left panel - dark branding with video */}
      <div className="hidden lg:flex lg:w-[58%] relative overflow-hidden bg-[#0F0F0F] flex-col justify-between p-14">
        {/* Background video */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        >
          <source src="/login-hero.mp4" type="video/mp4" />
        </video>
        {/* Readability gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0F0F0F] via-[#0F0F0F]/70 to-transparent" />
        {/* Oversized diamond, cut in half on the left edge */}
        <div
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/15 rotate-45 pointer-events-none"
          style={{ width: 620, height: 620 }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Spectra" className="w-14 h-14 rounded-[4px]" />
            <span className="text-white font-semibold text-3xl tracking-tight">Spectra</span>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-white text-6xl font-bold leading-[1.05] tracking-tight mb-6">
            Time tracking for<br />production teams.
          </h1>
          <div className="flex items-center gap-4">
            <div className="w-10 h-px bg-white/30" />
            <p className="text-neutral-300 text-xl">
              Track hours, manage budgets, and keep projects on time.
            </p>
          </div>
        </div>

        <div className="relative z-10 text-neutral-500 text-sm">
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
            {mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create your account' : 'Reset password'}
          </h2>
          <p className="text-neutral-500 text-sm mb-8">
            {mode === 'signin'
              ? 'Enter your credentials to access your account'
              : mode === 'register'
                ? 'Sign up with your @reflektor.digital email and start right away.'
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
            <form onSubmit={mode === 'signin' ? handleLogin : mode === 'register' ? handleRegister : handleReset} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-neutral-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    placeholder="Jane Smith"
                  />
                </div>
              )}

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
                  placeholder={mode === 'register' ? 'you@reflektor.digital' : 'you@company.com'}
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
                      Password
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => { setMode('reset'); setError(null) }}
                        className="text-xs text-[#3E0BE5] hover:underline font-medium"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={mode === 'register' ? 8 : undefined}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  {mode === 'register' && (
                    <p className="text-xs text-neutral-400 mt-1">At least 8 characters.</p>
                  )}
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
                  ? (mode === 'signin' ? 'Signing in...' : mode === 'register' ? 'Creating account...' : 'Sending...')
                  : (mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account & sign in' : 'Send reset link')}
              </button>

              {mode === 'signin' && (
                <p className="text-sm text-neutral-500 text-center">
                  New to Spectra?{' '}
                  <button type="button" onClick={() => { setMode('register'); setError(null) }} className="text-[#3E0BE5] hover:underline font-medium">
                    Create an account
                  </button>
                </p>
              )}
              {(mode === 'register' || mode === 'reset') && (
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
