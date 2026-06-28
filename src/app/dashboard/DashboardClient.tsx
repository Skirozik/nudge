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

interface Message {
  id: string
  direction: string
  body: string
  createdAt: string
}

interface UpcomingReminder {
  id: string
  sendAt: string
  assignmentTitle: string
  assignmentCourse: string | null
}

interface Props {
  user: { phone: string; persona: string; timezone: string }
  initialAssignments: Assignment[]
  messages: Message[]
  upcomingReminders: UpcomingReminder[]
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

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffH = Math.round(diffMs / (1000 * 60 * 60))
  if (Math.abs(diffH) < 1) return 'soon'
  if (diffH > 0 && diffH < 24) return `in ${diffH}h`
  if (diffH < 0 && diffH > -24) return `${Math.abs(diffH)}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function DashboardClient({ user, initialAssignments, messages, upcomingReminders }: Props) {
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [persona, setPersona] = useState(user.persona)
  const [personaSaving, setPersonaSaving] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [timezone, setTimezone] = useState(user.timezone)
  const [timezoneInput, setTimezoneInput] = useState(user.timezone)
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  const [timezoneSaved, setTimezoneSaved] = useState(false)

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addCourse, setAddCourse] = useState('')
  const [addDueAt, setAddDueAt] = useState('')
  const [addReminderOffsets, setAddReminderOffsets] = useState<number[]>([24])
  const [showCustomReminder, setShowCustomReminder] = useState(false)
  const [customReminderAt, setCustomReminderAt] = useState('')
  const [addMode, setAddMode] = useState('basic')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const REMINDER_PRESETS = [
    { label: '1h before', hours: 1 },
    { label: '3h before', hours: 3 },
    { label: '1 day before', hours: 24 },
    { label: '2 days before', hours: 48 },
    { label: '1 week before', hours: 168 },
  ]

  function togglePreset(hours: number) {
    setAddReminderOffsets((prev) =>
      prev.includes(hours) ? prev.filter((h) => h !== hours) : [...prev, hours]
    )
  }

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

  async function cancelAssignment(id: string) {
    setCanceling(id)
    await fetch('/api/dashboard/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'canceled' }),
    })
    setAssignments((prev) => prev.filter((a) => a.id !== id))
    setCanceling(null)
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!addTitle || !addDueAt) { setAddError('Title and due date are required'); return }

    const offsets = [...addReminderOffsets]
    if (showCustomReminder && customReminderAt) {
      const offset = Math.round(
        (new Date(addDueAt).getTime() - new Date(customReminderAt).getTime()) / (1000 * 60 * 60)
      )
      if (offset <= 0) { setAddError('Custom reminder must be before the due date'); return }
      if (offset > 720) { setAddError('Custom reminder can\'t be more than 30 days before'); return }
      if (!offsets.includes(offset)) offsets.push(offset)
    }
    if (offsets.length === 0) offsets.push(24)

    setAddError('')
    setAddSaving(true)

    const res = await fetch('/api/dashboard/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: addTitle,
        course: addCourse || null,
        due_at: new Date(addDueAt).toISOString(),
        reminder_offsets: offsets,
        nudge_mode: addMode,
      }),
    })

    if (!res.ok) {
      setAddError('Something went wrong — try again')
      setAddSaving(false)
      return
    }

    const created: Assignment = await res.json()
    setAssignments((prev) => [created, ...prev].sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    ))
    setAddTitle('')
    setAddCourse('')
    setAddDueAt('')
    setAddReminderOffsets([24])
    setShowCustomReminder(false)
    setCustomReminderAt('')
    setAddMode('basic')
    setShowAddForm(false)
    setAddSaving(false)
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

  async function saveTimezone(e: React.FormEvent) {
    e.preventDefault()
    setTimezoneSaving(true)
    const res = await fetch('/api/dashboard/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: timezoneInput }),
    })
    const data = await res.json()
    setTimezone(data.timezone)
    setTimezoneInput(data.timezone)
    setTimezoneSaving(false)
    setTimezoneSaved(true)
    setTimeout(() => setTimezoneSaved(false), 2000)
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
            <div className="flex items-center gap-3">
              <span className="text-white/30 text-sm">{assignments.length} open</span>
              <button
                onClick={() => { setShowAddForm((v) => !v); setAddError('') }}
                className="text-sm font-medium text-[#007AFF] hover:text-[#0066DD] transition-colors"
              >
                {showAddForm ? 'Cancel' : '+ Add'}
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAddForm && (
            <form onSubmit={addAssignment} className="bg-white/5 rounded-2xl p-5 mb-4 space-y-4">
              <div className="space-y-3">
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Assignment title"
                  required
                  className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#007AFF] transition-colors"
                />
                <input
                  type="text"
                  value={addCourse}
                  onChange={(e) => setAddCourse(e.target.value)}
                  placeholder="Course name (optional)"
                  className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#007AFF] transition-colors"
                />
                <input
                  type="datetime-local"
                  value={addDueAt}
                  onChange={(e) => setAddDueAt(e.target.value)}
                  required
                  className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#007AFF] transition-colors [color-scheme:dark]"
                />
                <div>
                  <label className="text-white/40 text-xs mb-2 block">Remind me</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {REMINDER_PRESETS.map((p) => (
                      <button
                        key={p.hours}
                        type="button"
                        onClick={() => togglePreset(p.hours)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          addReminderOffsets.includes(p.hours)
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomReminder((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        showCustomReminder
                          ? 'bg-[#007AFF] border-[#007AFF] text-white'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                      }`}
                    >
                      + custom time
                    </button>
                  </div>
                  {showCustomReminder && (
                    <input
                      type="datetime-local"
                      value={customReminderAt}
                      onChange={(e) => setCustomReminderAt(e.target.value)}
                      className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#007AFF] transition-colors [color-scheme:dark]"
                    />
                  )}
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1.5 block">Mode</label>
                  <div className="flex rounded-xl border border-white/10 overflow-hidden">
                    {['basic', 'persistent'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAddMode(m)}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                          addMode === m ? 'bg-[#007AFF] text-white' : 'bg-white/10 text-white/50 hover:text-white/80'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {addError && <p className="text-red-400 text-xs">{addError}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={addSaving}
                  className="bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-40 transition-colors text-white text-sm font-medium px-5 py-2.5 rounded-xl"
                >
                  {addSaving ? 'Saving...' : 'Save assignment'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddError('') }}
                  className="text-white/40 hover:text-white/70 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {assignments.length === 0 ? (
            <div className="bg-white/5 rounded-2xl p-8 text-center text-white/40 text-sm">
              No open assignments. Add one above or text Nudge.
            </div>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="bg-white/5 hover:bg-white/[0.08] transition-colors rounded-2xl px-5 py-4 flex items-center gap-4"
                >
                  <button
                    onClick={() => markDone(a.id)}
                    disabled={completing === a.id || canceling === a.id}
                    className="w-5 h-5 rounded-full border-2 border-white/20 hover:border-[#007AFF] flex-shrink-0 transition-colors disabled:opacity-40"
                    title="Mark done"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.title}</p>
                    {a.course && <p className="text-white/40 text-sm truncate">{a.course}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-white/70">{formatDue(a.dueAt)}</p>
                    <p className="text-xs text-white/30 mt-0.5">
                      {a.nudgeMode === 'persistent' ? '🔁 persistent' : '📌 basic'}
                    </p>
                  </div>
                  <button
                    onClick={() => cancelAssignment(a.id)}
                    disabled={completing === a.id || canceling === a.id}
                    className="text-white/20 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0 text-lg leading-none"
                    title="Cancel assignment"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming reminders */}
        {upcomingReminders.length > 0 && (
          <section>
            <h2 className="font-semibold text-lg mb-4">Scheduled reminders</h2>
            <ul className="space-y-2">
              {upcomingReminders.map((r) => (
                <li key={r.id} className="bg-white/5 rounded-2xl px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.assignmentTitle}</p>
                    {r.assignmentCourse && (
                      <p className="text-white/40 text-xs truncate">{r.assignmentCourse}</p>
                    )}
                  </div>
                  <span className="text-white/50 text-sm flex-shrink-0 ml-4">{formatTime(r.sendAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
                    : 'border-white/10 bg-white/5 hover:bg-white/[0.08]'
                }`}
              >
                <div className="text-2xl mb-2">{p.emoji}</div>
                <p className="font-medium text-sm">{p.label}</p>
                <p className="text-white/40 text-xs mt-1 leading-snug">{p.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Timezone settings */}
        <section>
          <h2 className="font-semibold text-lg mb-4">Timezone</h2>
          <div className="bg-white/5 rounded-2xl p-5">
            <p className="text-white/40 text-sm mb-3">
              Current: <span className="text-white/70 font-mono">{timezone}</span>
            </p>
            <form onSubmit={saveTimezone} className="flex gap-3">
              <input
                type="text"
                value={timezoneInput}
                onChange={(e) => setTimezoneInput(e.target.value)}
                placeholder="e.g. Chicago or America/Chicago"
                className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#007AFF] transition-colors"
              />
              <button
                type="submit"
                disabled={timezoneSaving || timezoneInput === timezone}
                className="bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-40 transition-colors text-white text-sm font-medium px-4 py-2 rounded-xl"
              >
                {timezoneSaving ? 'Saving...' : timezoneSaved ? 'Saved!' : 'Save'}
              </button>
            </form>
          </div>
        </section>

        {/* Message history */}
        <section>
          <h2 className="font-semibold text-lg mb-4">Recent messages</h2>
          {messages.length === 0 ? (
            <div className="bg-white/5 rounded-2xl p-8 text-center text-white/40 text-sm">
              No messages yet.
            </div>
          ) : (
            <div className="bg-white/5 rounded-2xl p-4 space-y-3 max-h-96 overflow-y-auto">
              {[...messages].reverse().map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.direction === 'out' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.direction === 'out'
                        ? 'bg-[#007AFF] text-white rounded-br-sm'
                        : 'bg-white/10 text-white/90 rounded-bl-sm'
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-white/20 text-xs mt-1 px-1">{formatMessageTime(m.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
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
