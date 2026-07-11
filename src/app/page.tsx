import Link from 'next/link'

export const metadata = {
  title: 'Nudge — Study reminders on iMessage',
  description: "The study buddy that texts you until you actually do it. No app, no notification drawer.",
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-white">

      {/* Nav */}
      <nav className="max-w-[1100px] mx-auto px-8 sm:px-10 h-16 flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">nudge</span>
        <Link
          href="/login"
          className="text-[13px] text-[#555] hover:text-[#888] transition-colors duration-150"
        >
          Dashboard
        </Link>
      </nav>

      <main className="max-w-[1100px] mx-auto px-8 sm:px-10">

        {/* ── Hero ─────────────────────────────────────── */}
        <section className="pt-20 pb-32 grid lg:grid-cols-[1fr_360px] gap-16 lg:gap-20 items-center">

          {/* Left: copy */}
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#007AFF] mb-8">
              iMessage
            </p>
            <h1 className="text-[52px] sm:text-[64px] font-bold leading-[1.04] tracking-[-0.03em] mb-6 text-balance">
              The reminder you can&apos;t ignore.
            </h1>
            <p className="text-[17px] text-[#8E8E93] leading-[1.65] mb-10 max-w-[400px]">
              Nudge texts you on iMessage when assignments are due. It keeps texting until you reply. No app to download, no notification to swipe away.
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <a
                href="imessage://hinudge@icloud.com"
                className="inline-flex items-center gap-2.5 bg-[#007AFF] hover:bg-[#0071E3] text-white text-[15px] font-semibold px-6 py-3 rounded-lg transition-colors duration-150"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
                Text Nudge
              </a>
              <code className="text-[13px] text-[#48484A] font-mono">hinudge@icloud.com</code>
            </div>
          </div>

          {/* Right: iMessage mockup */}
          <div className="bg-[#111] border border-[#1E1E1E] rounded-2xl overflow-hidden">
            {/* Contact header */}
            <div className="border-b border-[#1E1E1E] px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#007AFF] grid place-items-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold leading-none">Nudge</p>
                <p className="text-[11px] text-[#48484A] mt-0.5">iMessage</p>
              </div>
            </div>
            {/* Messages */}
            <div className="px-4 py-4 space-y-2">
              {[
                { from: 'user', text: 'i have a bio exam friday and i keep forgetting' },
                { from: 'nudge', text: 'bio exam friday — what time? want me to really nag you on this one?' },
                { from: 'user', text: 'nag me lol 8am' },
                { from: 'nudge', text: 'locked in. blowing up your phone thursday morning. you asked for this' },
              ].map((m, i) => (
                <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`px-3.5 py-2 text-[14px] max-w-[82%] leading-[1.4] ${
                      m.from === 'user'
                        ? 'bg-[#007AFF] text-white rounded-[18px] rounded-br-[4px]'
                        : 'bg-[#1C1C1E] text-white/90 rounded-[18px] rounded-bl-[4px]'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-[#48484A] text-right pt-0.5">Delivered</p>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────── */}
        <section className="border-t border-[#1E1E1E] pb-32">
          <div className="grid sm:grid-cols-3">
            {[
              {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                ),
                title: 'iMessage native',
                body: 'Shows up as a blue bubble. No app, no notification banner to swipe away.',
              },
              {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                ),
                title: 'Persistent mode',
                body: '5 texts, 30 seconds apart, each more pointed than the last. Stops when you reply.',
              },
              {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
                title: 'Just text it',
                body: '"bio exam friday at 8am, nag me" — one message. Parsed, saved, and scheduled.',
              },
            ].map((f, i) => (
              <div
                key={f.title}
                className={`pt-10 pb-14 ${
                  i === 0 ? 'sm:pr-10' :
                  i === 1 ? 'sm:px-10 sm:border-x border-[#1E1E1E] border-t sm:border-t-0' :
                            'sm:pl-10 border-t sm:border-t-0 border-[#1E1E1E]'
                }`}
              >
                <div className="text-[#48484A] mb-5">{f.icon}</div>
                <h3 className="text-[15px] font-semibold mb-2">{f.title}</h3>
                <p className="text-[14px] text-[#666] leading-[1.65]">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#1E1E1E]">
        <div className="max-w-[1100px] mx-auto px-8 sm:px-10 h-14 flex items-center justify-between">
          <span className="text-[14px] font-semibold tracking-[-0.01em]">nudge</span>
          <Link
            href="/login"
            className="text-[13px] text-[#555] hover:text-[#888] transition-colors duration-150"
          >
            Dashboard
          </Link>
        </div>
      </footer>

    </div>
  )
}
