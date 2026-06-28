'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Assignment {
  id: string
  title: string
  course: string | null
  dueAt: string
  nudgeMode: string
  nextReminder: string | null
}

interface Props {
  user: { phone: string; persona: string; timezone: string }
  initialAssignments: Assignment[]
}

const PERSONAS = [
  { id: 'coach', label: 'Coach', emoji: '🏆', desc: 'Warm, supportive, gets things done' },
  { id: 'snarky', label: 'Snarky', emoji: '😏', desc: 'Dry humor, calls you out, still shows up' },
  { id: 'anxious', label: 'Anxious', emoji: '😰', desc: 'Stressed on your behalf, endearingly flustered' },
]

function formatDue(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffH = Math.round(diffMs / (1000 * 60 * 60))

  if (diffH < 0) return 'overdue'
  if (diffH < 24) return `in ${diffH}h`
  const diffD = Math.round(diffH / 24)
  if (diffD === 1) return 'tomorrow'
  if (diffD < 7) return `in ${diffD} days`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DashboardClient({ user, initialAssignments }: Props) {
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [persona, setPersona] = useState(user.persona)
  const [personaSaving, setPersonaSaving] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)

  async function markDone(id: string) {
    setCompleting(id)
    await fetch('/api/dashboard/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    })
    setAssignments((prev) => prev.filter((a) => a.id !== id))
    setCompleting(null)
  }

  async function savePersona(newPersona: string) {
    setPersona(newPersona)
    setPersonaSaving(true)
    await fetch('/api/dashboard/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: newPersona }),
    })
    setPersonaSaving(false)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <Link href="/" className="text-lg font-bold tracking-tight">nudge</Link>
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm font-mono">{user.phone}</span>
          <button onClick={logout} className="text-white/40 hover:text-white/70 text-sm transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">

        {/* Assignments */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Upcoming assignments</h2>
            <span className="text-white/30 text-sm">{assignments.length} open</span>
          </div>

          {assignments.length === 0 ? (
            <div className="bg-white/5 rounded-2xl p-8 text-center text-white/40 text-sm">
              No open assignments. Text Nudge to add one.
            </div>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="bg-white/5 hover:bg-white/8 transition-colors rounded-2xl px-5 py-4 flex items-center gap-4"
                >
                  <button
                    onClick={() => markDone(a.id)}
                    disabled={completing === a.id}
                    className="w-5 h-5 rounded-full border-2 border-white/20 hover:border-[#007AFF] flex-shrink-0 transition-colors disabled:opacity-40"
                    title="Mark done"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.title}</p>
                    {a.course && (
                      <p className="text-white/40 text-sm truncate">{a.course}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-white/70">{formatDue(a.dueAt)}</p>
                    <p className="text-xs text-white/30 mt-0.5">
                      {a.nudgeMode === 'persistent' ? '🔁 persistent' : '📌 basic'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Persona picker */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Nudge personality</h2>
            {personaSaving && <span className="text-white/30 text-sm">Saving...</span>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => savePersona(p.id)}
                className={`rounded-2xl p-4 text-left transition-all border ${
                  persona === p.id
                    ? 'border-[#007AFF] bg-[#007AFF]/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/8'
                }`}
              >
                <div className="text-2xl mb-2">{p.emoji}</div>
                <p className="font-medium text-sm">{p.label}</p>
                <p className="text-white/40 text-xs mt-1 leading-snug">{p.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Quick tip */}
        <section className="bg-white/5 rounded-2xl p-5">
          <p className="text-white/50 text-sm leading-relaxed">
            <span className="text-white font-medium">Add or manage assignments by texting Nudge.</span>
            {' '}Just say things like &quot;I have a bio exam friday at 8am, nag me&quot; and it&apos;ll handle the rest.
          </p>
        </section>

      </main>
    </div>
  )
}
