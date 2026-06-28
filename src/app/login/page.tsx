'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Step = 'phone' | 'code'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <Link href="/" className="text-2xl font-bold tracking-tight mb-12">nudge</Link>

      <div className="w-full max-w-sm">
        {step === 'phone' ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">Sign in</h1>
              <p className="text-white/50 text-sm">
                Enter the phone number you text Nudge from.
              </p>
            </div>

            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#007AFF] transition-colors"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 transition-colors text-white font-semibold py-3 rounded-xl"
            >
              {loading ? 'Sending...' : 'Send code'}
            </button>

            <p className="text-white/30 text-xs text-center">
              Don&apos;t have an account? Text{' '}
              <span className="font-mono text-white/50">hinudge@icloud.com</span> on iMessage first.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">Check your texts</h1>
              <p className="text-white/50 text-sm">
                Nudge sent a 6-digit code to <span className="text-white/70">{phone}</span> via iMessage.
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#007AFF] transition-colors text-center text-2xl tracking-widest font-mono"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 transition-colors text-white font-semibold py-3 rounded-xl"
            >
              {loading ? 'Verifying...' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('phone'); setCode(''); setError('') }}
              className="w-full text-white/40 text-sm hover:text-white/60 transition-colors"
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
