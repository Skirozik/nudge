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

interface OneOffReminder {
  id: string
  message: string
  fireAt: string
}

interface Props {
  user: { phone: string; persona: string; timezone: string }
  initialAssignments: Assignment[]
  messages: Message[]
  upcomingReminders: UpcomingReminder[]
  initialOneOffReminders: OneOffReminder[]
}

const PERSONAS = [
  { id: 'coach', label: 'Coach', desc: 'Warm, supportive, gets things done' },
  { id: 'snarky', label: 'Snarky', desc: 'Dry humor, calls you out, still shows up' },
  { id: 'anxious', label: 'Anxious', desc: 'Stressed on your behalf, endearingly flustered' },
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

export default function DashboardClient({ user, initialAssignments, messages, upcomingReminders, initialOneOffReminders }: Props) {
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [oneOffReminders, setOneOffReminders] = useState<OneOffReminder[]>(initialOneOffReminders)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [persona, setPersona] = useState(user.persona)
  const [personaSaving, setPersonaSaving] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [timezone, setTimezone] = useState(user.timezone)
  const [timezoneInput, setTimezoneInput] = useState(user.timezone)
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  const [timezoneSaved, setTimezoneSaved] = useState(false)
  const [timezoneError, setTimezoneError] = useState('')
  const [personaError, setPersonaError] = useState('')
  const [assignmentError, setAssignmentError] = useState('')

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
    setAssignmentError('')
    const res = await fetch('/api/dashboard/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    })
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== id))
    } else {
      setAssignmentError('Failed to update — try again')
    }
    setCompleting(null)
  }

  async function cancelAssignment(id: string) {
    setCanceling(id)
    setAssignmentError('')
    const res = await fetch('/api/dashboard/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'canceled' }),
    })
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== id))
    } else {
      setAssignmentError('Failed to cancel — try again')
    }
    setCanceling(null)
  }

  async function dismissReminder(id: string) {
    setDismissing(id)
    const res = await fetch('/api/dashboard/reminders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setOneOffReminders((prev) => prev.filter((r) => r.id !== id))
    }
    setDismissing(null)
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!addTitle || !addDueAt) { setAddError('Title and due date are required'); return }

    const offsets = [...addReminderOffsets]
    if (showCustomReminder && customReminderAt) {
      const diffMs = new Date(addDueAt).getTime() - new Date(customReminderAt).getTime()
      if (diffMs <= 0) { setAddError('Custom reminder must be before the due date'); return }
      if (diffMs > 720 * 60 * 60 * 1000) { setAddError("Custom reminder can't be more than 30 days before"); return }
      const offset = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)))
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
    const prev = persona
    setPersona(newPersona)
    setPersonaSaving(true)
    setPersonaError('')
    const res = await fetch('/api/dashboard/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: newPersona }),
    })
    if (!res.ok) {
      setPersona(prev)
      setPersonaError('Failed to save — try again')
    }
    setPersonaSaving(false)
  }

  async function saveTimezone(e: React.FormEvent) {
    e.preventDefault()
    setTimezoneSaving(true)
    setTimezoneError('')
    const res = await fetch('/api/dashboard/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: timezoneInput }),
    })
    if (!res.ok) {
      setTimezoneError('Invalid timezone — try a city name like "Chicago" or "New York"')
      setTimezoneSaving(false)
      return
    }
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
    <div className="min-h-screen bg-[#080808] text-white">

      {/* Header */}
      <header className="border-b border-[#1E1E1E] max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">nudge</Link>
        <div className="flex items-center gap-5">
          <span className="text-[13px] text-[#48484A] font-mono hidden sm:block">{user.phone}</span>
          <button
            onClick={logout}
            className="text-[13px] text-[#555] hover:text-[#888] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">

        {/* ── Assignments ──────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Assignments</h2>
              <span className="text-[12px] text-[#48484A]">{assignments.length} open</span>
              {assignmentError && <span className="text-[12px] text-red-400">{assignmentError}</span>}
            </div>
            <button
              onClick={() => { setShowAddForm((v) => !v); setAddError(''); setAssignmentError('') }}
              className="text-[13px] font-medium text-[#007AFF] hover:text-[#0071E3] transition-colors"
            >
              {showAddForm ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <form onSubmit={addAssignment} className="bg-[#111] border border-[#1E1E1E] rounded-xl p-5 mb-4 space-y-4">
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Assignment title"
                  required
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-md px-4 py-2.5 text-sm text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#007AFF] transition-colors"
                />
                <input
                  type="text"
                  value={addCourse}
                  onChange={(e) => setAddCourse(e.target.value)}
                  placeholder="Course name (optional)"
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-md px-4 py-2.5 text-sm text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#007AFF] transition-colors"
                />
                <input
                  type="datetime-local"
                  value={addDueAt}
                  onChange={(e) => setAddDueAt(e.target.value)}
                  required
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-md px-4 py-2.5 text-sm text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#007AFF] transition-colors [color-scheme:dark]"
                />

                <div>
                  <label className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#48484A] mb-2 block">
                    Remind me
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {REMINDER_PRESETS.map((p) => (
                      <button
                        key={p.hours}
                        type="button"
                        onClick={() => togglePreset(p.hours)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                          addReminderOffsets.includes(p.hours)
                            ? 'bg-[#007AFF] border-[#007AFF] text-white'
                            : 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93] hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomReminder((v) => !v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                        showCustomReminder
                          ? 'bg-[#007AFF] border-[#007AFF] text-white'
                          : 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93] hover:text-white'
                      }`}
                    >
                      + custom
                    </button>
                  </div>
                  {showCustomReminder && (
                    <input
                      type="datetime-local"
                      value={customReminderAt}
                      onChange={(e) => setCustomReminderAt(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-md px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#007AFF] transition-colors [color-scheme:dark]"
                    />
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#48484A] mb-2 block">
                    Mode
                  </label>
                  <div className="flex rounded-md border border-[#2C2C2E] overflow-hidden">
                    {['basic', 'persistent'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAddMode(m)}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                          addMode === m
                            ? 'bg-[#007AFF] text-white'
                            : 'bg-[#1C1C1E] text-[#8E8E93] hover:text-white'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {addError && <p className="text-red-400 text-xs">{addError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={addSaving}
                  className="bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 transition-colors text-white text-sm font-medium px-5 py-2.5 rounded-lg"
                >
                  {addSaving ? 'Saving…' : 'Save assignment'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddError('') }}
                  className="text-[#555] hover:text-[#888] text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {assignments.length === 0 ? (
            <div className="border border-dashed border-[#1E1E1E] rounded-lg p-8 text-center text-[#48484A] text-sm">
              No open assignments. Add one above or text Nudge.
            </div>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="bg-[#111] hover:bg-[#161616] border border-[#1E1E1E] transition-colors rounded-lg px-4 py-3.5 flex items-center gap-4"
                >
                  <button
                    onClick={() => markDone(a.id)}
                    disabled={completing === a.id || canceling === a.id}
                    className="w-4 h-4 rounded-full border-2 border-[#333] hover:border-[#007AFF] flex-shrink-0 transition-colors disabled:opacity-40"
                    title="Mark done"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{a.title}</p>
                    {a.course && (
                      <p className="text-[12px] text-[#666] truncate mt-0.5">{a.course}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[13px] text-[#8E8E93]">{formatDue(a.dueAt)}</p>
                    <p className="text-[11px] text-[#3D3D3D] mt-0.5 uppercase tracking-wide">
                      {a.nudgeMode === 'persistent' ? 'persistent' : 'basic'}
                    </p>
                  </div>
                  <button
                    onClick={() => cancelAssignment(a.id)}
                    disabled={completing === a.id || canceling === a.id}
                    className="text-[#3D3D3D] hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0 text-lg leading-none"
                    title="Cancel assignment"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── One-off reminders ────────────────────── */}
        {oneOffReminders.length > 0 && (
          <section>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] mb-4">Reminders</h2>
            <ul className="space-y-2">
              {oneOffReminders.map((r) => (
                <li
                  key={r.id}
                  className="bg-[#111] border border-[#1E1E1E] rounded-lg px-4 py-3.5 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{r.message}</p>
                    <p className="text-[12px] text-[#666] mt-0.5">{formatTime(r.fireAt)}</p>
                  </div>
                  <button
                    onClick={() => dismissReminder(r.id)}
                    disabled={dismissing === r.id}
                    className="text-[#3D3D3D] hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0 text-lg leading-none"
                    title="Dismiss reminder"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Upcoming reminders ───────────────────── */}
        {upcomingReminders.length > 0 && (
          <section>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] mb-4">Scheduled reminders</h2>
            <ul className="space-y-1.5">
              {upcomingReminders.map((r) => (
                <li
                  key={r.id}
                  className="bg-[#111] border border-[#1E1E1E] rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium truncate">{r.assignmentTitle}</p>
                    {r.assignmentCourse && (
                      <p className="text-[12px] text-[#666] truncate mt-0.5">{r.assignmentCourse}</p>
                    )}
                  </div>
                  <span className="text-[13px] text-[#8E8E93] flex-shrink-0 ml-4">
                    {formatTime(r.sendAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Personality ──────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Nudge personality</h2>
            <div className="flex items-center gap-3">
              {personaSaving && <span className="text-[12px] text-[#48484A]">Saving…</span>}
              {personaError && <span className="text-[12px] text-red-400">{personaError}</span>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => savePersona(p.id)}
                className={`rounded-lg p-4 text-left transition-all border ${
                  persona === p.id
                    ? 'border-[#007AFF] bg-[#007AFF]/10'
                    : 'border-[#1E1E1E] bg-[#111] hover:bg-[#161616]'
                }`}
              >
                <p className="text-[14px] font-medium">{p.label}</p>
                <p className="text-[12px] text-[#666] mt-1 leading-snug">{p.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ── Timezone ─────────────────────────────── */}
        <section>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] mb-4">Timezone</h2>
          <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-5">
            <p className="text-[13px] text-[#666] mb-3">
              Current: <span className="text-[#8E8E93] font-mono">{timezone}</span>
            </p>
            <form onSubmit={saveTimezone} className="flex gap-2.5">
              <input
                type="text"
                value={timezoneInput}
                onChange={(e) => setTimezoneInput(e.target.value)}
                placeholder="e.g. Chicago or America/Chicago"
                className="flex-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-md px-4 py-2 text-sm text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#007AFF] transition-colors"
              />
              <button
                type="submit"
                disabled={timezoneSaving || timezoneInput === timezone}
                className="bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 transition-colors text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {timezoneSaving ? 'Saving…' : timezoneSaved ? 'Saved' : 'Save'}
              </button>
            </form>
            {timezoneError && <p className="text-red-400 text-xs mt-2">{timezoneError}</p>}
          </div>
        </section>

        {/* ── Message history ──────────────────────── */}
        <section>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] mb-4">Recent messages</h2>
          {messages.length === 0 ? (
            <div className="border border-dashed border-[#1E1E1E] rounded-lg p-8 text-center text-[#48484A] text-sm">
              No messages yet.
            </div>
          ) : (
            <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-4 space-y-3 max-h-96 overflow-y-auto">
              {[...messages].reverse().map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.direction === 'out' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-[18px] px-4 py-2 text-sm ${
                      m.direction === 'out'
                        ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                        : 'bg-[#1C1C1E] text-white/90 rounded-bl-[4px]'
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[11px] text-[#3D3D3D] mt-1 px-1">
                    {formatMessageTime(m.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Tip ─────────────────────────────────── */}
        <section className="border-t border-[#1E1E1E] pt-6 pb-4">
          <p className="text-[13px] text-[#48484A] leading-relaxed">
            <span className="text-[#666] font-medium">Add assignments by texting Nudge.</span>
            {' '}Just say &quot;I have a bio exam friday at 8am, nag me&quot; and it&apos;ll handle the rest.
          </p>
        </section>

      </main>
    </div>
  )
}
