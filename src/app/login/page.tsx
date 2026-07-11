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

  const isEmail = phone.includes('@')

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
    <div className="min-h-screen bg-[#080808] text-white flex flex-col">

      {/* Nav */}
      <nav className="px-8 sm:px-10 h-16 flex items-center">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">
          nudge
        </Link>
      </nav>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-[340px]">

          {step === 'phone' ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <div className="mb-8">
                <h1 className="text-[28px] font-bold tracking-[-0.02em] mb-2">Sign in</h1>
                <p className="text-[14px] text-[#8E8E93]">
                  Enter the phone number or Apple ID email you text Nudge from.
                </p>
              </div>

              <input
                type="text"
                inputMode={isEmail ? 'email' : 'tel'}
                placeholder="+1 (555) 000-0000 or you@icloud.com"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-[#111] border border-[#1E1E1E] rounded-md px-4 py-3 text-[15px] text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#007AFF] transition-colors"
              />

              {error && <p className="text-[13px] text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 transition-colors text-white font-semibold py-3 rounded-lg text-[15px]"
              >
                {loading ? 'Sending…' : 'Send code'}
              </button>

              <p className="text-[12px] text-[#48484A] text-center pt-1">
                No account? Text{' '}
                <code className="font-mono text-[#666]">hinudge@icloud.com</code>
                {' '}on iMessage first.
              </p>
            </form>

          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div className="mb-8">
                <h1 className="text-[28px] font-bold tracking-[-0.02em] mb-2">Check your texts</h1>
                <p className="text-[14px] text-[#8E8E93]">
                  Code sent to <span className="text-white/80">{phone}</span>.
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                className="w-full bg-[#111] border border-[#1E1E1E] rounded-md px-4 py-3 text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#007AFF] transition-colors text-center text-[28px] tracking-[0.25em] font-mono"
              />

              {error && <p className="text-[13px] text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 transition-colors text-white font-semibold py-3 rounded-lg text-[15px]"
              >
                {loading ? 'Verifying…' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('phone'); setCode(''); setError('') }}
                className="w-full text-[#48484A] text-[13px] hover:text-[#888] transition-colors"
              >
                Use a different number
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
