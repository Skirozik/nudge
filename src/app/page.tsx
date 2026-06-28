import Link from 'next/link'

export const metadata = {
  title: 'Nudge — Your ADHD study buddy on iMessage',
  description: 'Reminders that actually work. Nudge texts you on iMessage so you never miss a deadline.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <span className="text-xl font-bold tracking-tight">nudge</span>
        <Link
          href="/login"
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          Dashboard →
        </Link>
      </nav>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-6 pt-20 pb-32">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-sm text-white/70 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            Now in beta
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight mb-6">
            The reminder you
            <br />
            <span className="text-[#007AFF]">can&apos;t ignore.</span>
          </h1>

          <p className="text-lg text-white/60 mb-10 leading-relaxed">
            Nudge is an AI study buddy that texts you on iMessage.
            Tell it what&apos;s due, and it&apos;ll hound you until you do it.
            Built for people with real ADHD.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <a
              href="imessage://hinudge@icloud.com"
              className="inline-flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066DD] transition-colors text-white font-semibold px-6 py-3 rounded-full text-base"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              Text Nudge now
            </a>
            <div className="flex flex-col gap-1">
              <p className="text-white/40 text-sm">or iMessage</p>
              <code className="text-white/80 text-sm font-mono">hinudge@icloud.com</code>
            </div>
          </div>
        </div>

        {/* Chat mockup */}
        <div className="mt-20 max-w-xs">
          <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
            <div className="flex justify-end">
              <div className="bg-[#007AFF] rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-[80%]">
                i have a bio exam friday and i keep forgetting
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-[#2C2C2E] rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-[80%] text-white/90">
                ok so bio exam friday — what time? and do you want me to really nag you on this one or just a single reminder?
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[#007AFF] rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-[80%]">
                nag me lol 8am
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-[#2C2C2E] rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-[80%] text-white/90">
                locked in. i&apos;ll start blowing up your phone thursday morning. you asked for this 😤
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid sm:grid-cols-3 gap-8">
          {[
            {
              icon: '💬',
              title: 'iMessage native',
              body: 'Shows up where your friends do. Blue bubbles, typing indicators, the whole thing.',
            },
            {
              icon: '🔁',
              title: 'Persistent nag mode',
              body: '5 escalating texts, 30 seconds apart. Stops when you reply. You will not forget.',
            },
            {
              icon: '🧠',
              title: 'Actually understands you',
              body: 'Just text it like a friend. "remind me to study for chem tomorrow at 6" just works.',
            },
          ].map((f) => (
            <div key={f.title} className="bg-white/5 rounded-2xl p-6">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/10 px-6 py-8 max-w-5xl mx-auto flex items-center justify-between text-white/30 text-sm">
        <span>nudge</span>
        <Link href="/login" className="hover:text-white/60 transition-colors">
          Dashboard
        </Link>
      </footer>
    </div>
  )
}
