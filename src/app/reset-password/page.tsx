'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  // The email link drops the user here with a recovery session in the URL hash;
  // supabase-js parses it and fires a session. We flag readiness for a hint only —
  // submitting without a session still surfaces a clear error from updateUser.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => { router.push('/login'); router.refresh() }, 1500)
  }

  return (
    <div className="flex h-screen">
      <div className="hidden lg:flex lg:w-1/2 bg-[#0F0F0F] flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Spectra" className="w-8 h-8 rounded-[2px]" />
            <span className="text-white font-semibold text-xl tracking-tight">Spectra</span>
          </div>
          <h1 className="text-white text-4xl font-bold leading-tight mb-4">Set a new<br />password.</h1>
          <p className="text-neutral-400 text-lg">Choose something you&apos;ll remember.</p>
        </div>
        <div className="text-neutral-600 text-sm">&copy; 2024 Spectra. All rights reserved.</div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">New password</h2>
          <p className="text-neutral-500 text-sm mb-8">Enter and confirm your new password below.</p>

          {done ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-[4px] text-green-700 text-sm">
              Password updated. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1.5">New password</label>
                <input
                  id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-neutral-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-neutral-700 mb-1.5">Confirm password</label>
                <input
                  id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                  className="w-full px-3 py-2 border border-neutral-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[4px] text-red-700 text-sm">{error}</div>
              )}
              {!ready && !error && (
                <p className="text-xs text-neutral-400">Verifying your reset link…</p>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full py-2 px-4 bg-neutral-900 text-white text-sm font-medium rounded-[4px] hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
              <a href="/login" className="block text-sm text-neutral-500 hover:text-neutral-800 font-medium">← Back to sign in</a>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
