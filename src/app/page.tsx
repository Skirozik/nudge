import { Inter_Tight } from 'next/font/google'
import Link from 'next/link'
import PhoneSplitDemo from './PhoneSplitDemo'
import { RevealSection } from './RevealSection'

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata = {
  title: 'nudge — study reminders on iMessage',
  description: 'set a reminder by texting nudge. it keeps texting you until you actually do it.',
}

// ── Mini iMessage bubble ──────────────────────────────────────────────────────

function Bubble({
  from,
  text,
  isGrouped,
  isLast,
}: {
  from: 'me' | 'them'
  text: string
  isGrouped: boolean
  isLast: boolean
}) {
  const sent = from === 'me'
  let radius: string
  if (sent) {
    radius = isLast ? '18px 18px 4px 18px' : isGrouped ? '18px 5px 5px 18px' : '18px 18px 18px 18px'
  } else {
    radius = isLast ? '18px 18px 18px 4px' : isGrouped ? '5px 18px 18px 5px' : '18px 18px 18px 18px'
  }

  return (
    <div style={{ display: 'flex', justifyContent: sent ? 'flex-end' : 'flex-start' }}>
      <span
        className={sent ? 'lp-bbl-sent' : 'lp-bbl-recv'}
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 14,
          lineHeight: '20px',
          letterSpacing: '-0.1px',
          padding: '7px 12px 8px',
          borderRadius: radius,
          maxWidth: '85%',
          display: 'block',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </span>
    </div>
  )
}

// ── Three showcase exchanges ──────────────────────────────────────────────────

const EXCHANGES: Array<{
  messages: Array<{ from: 'me' | 'them'; text: string }>
  caption: string
}> = [
  {
    messages: [
      { from: 'me',   text: 'bio exam friday 8am nag me' },
      { from: 'them', text: 'saved. thursday morning i\'m on it.' },
    ],
    caption: 'No commands. No forms. Just text it.',
  },
  {
    messages: [
      { from: 'them', text: 'bio exam tomorrow at 8am' },
      { from: 'them', text: "you haven't replied yet" },
      { from: 'them', text: 'still here. exam in 4 hours.' },
    ],
    caption: '5 texts, 30 seconds apart. Stops when you reply.',
  },
  {
    messages: [
      { from: 'them', text: 'psych essay due at midnight' },
      { from: 'me',   text: 'submitted it already' },
      { from: 'them', text: 'nice. clearing the rest of your reminders.' },
    ],
    caption: 'Stops the moment you reply.',
  },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <style>{`
        .lp-root {
          background: #000;
          min-height: 100vh;
          color: #fff;
          font-family: system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .lp-container {
          max-width: 1200px;
          margin: 0 auto;
          padding-left: 32px;
          padding-right: 32px;
        }

        /* hero grid (h1 row) */
        .lp-hero-grid {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 72px;
          align-items: center;
        }
        /* lower hero (subtext + phone) — same column structure, top-aligned */
        .lp-hero-lower {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 72px;
          align-items: flex-start;
        }
        /* exchanges grid */
        .lp-exchanges {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        /* hover / focus */
        .lp-nav-link {
          font-size: 13px;
          color: #555;
          text-decoration: none;
          transition: color 0.15s;
        }
        .lp-nav-link:hover { color: #fff; }
        .lp-nav-link:focus-visible {
          outline: 2px solid #0A84FF;
          outline-offset: 4px;
          border-radius: 3px;
          color: #fff;
        }
        .lp-cta:focus-visible {
          outline: 2px solid #fff;
          outline-offset: 3px;
        }
        .lp-cta:hover { background: #0071e3 !important; }
        .lp-cta:active { background: #0066cc !important; }

        /* step rows */
        .lp-step {
          display: flex;
          gap: 24px;
          align-items: baseline;
          padding: 24px 0;
          border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .lp-step:last-child { border-bottom: none; }

        /* ── Bubble colors ── */
        .lp-bbl-sent { background: #0A84FF; color: #fff; }
        .lp-bbl-recv { background: #1C1C1E; color: #fff; }
        .lp-light .lp-bbl-sent { background: #007AFF; color: #fff; }
        .lp-light .lp-bbl-recv { background: #E9E9EB; color: #000; }

        /* ── Exchange cards ── */
        .lp-exchange-card {
          background: #0D0D0D;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .lp-light .lp-exchange-card {
          background: #fff;
          border-color: rgba(0,0,0,0.06);
        }

        /* ── Exchange caption ── */
        .lp-exchange-caption {
          font-size: 13px;
          color: #555;
          margin: 12px 0 0;
          line-height: 1.5;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .lp-light .lp-exchange-caption { color: #888; }

        /* ── Text that flips dark → light ── */
        .lp-light-text { color: #111; }

        /* ── Light section link overrides ── */
        .lp-light .lp-nav-link { color: #555; }
        .lp-light .lp-nav-link:hover { color: #000; }

        /* ── Dark-to-light fade band (now contains lower hero content) ── */
        .lp-fade-band {
          position: relative;
          background: linear-gradient(
            180deg,
            #000 0%,
            #0E0F11 28%,
            #2A2C2E 50%,
            #6B6E71 68%,
            #B4B6B8 84%,
            #F2F3F4 100%
          );
        }
        @supports (background: linear-gradient(to bottom in oklab, #000, white)) {
          .lp-fade-band {
            background: linear-gradient(to bottom in oklab, #000, #F2F3F4);
          }
        }
        .lp-fade-band::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          background-repeat: repeat;
        }

        /* ── Light section ── */
        .lp-light { background: #F2F3F4; }

        /* ── responsive ── */
        @media (max-width: 1024px) {
          .lp-hero-grid,
          .lp-hero-lower {
            grid-template-columns: 1fr;
            gap: 56px;
          }
          .lp-phone-col {
            display: flex;
            justify-content: center;
            transform: scale(0.9);
            transform-origin: top center;
            height: 689px; /* 766 × 0.9 */
          }
        }
        @media (max-width: 768px) {
          .lp-container { padding-left: 16px; padding-right: 16px; }
          .lp-exchanges { grid-template-columns: 1fr; }
          .lp-phone-col {
            transform: scale(0.82);
            height: 628px; /* 766 × 0.82 */
          }
        }
        @media (max-width: 375px) {
          .lp-phone-col {
            transform: scale(0.74);
            height: 567px; /* 766 × 0.74 */
          }
        }

        /* Staggered children start hidden (JS overrides on reveal) */
        .lp-stagger > * {
          opacity: 0;
          transform: translateY(14px);
        }

        @media (prefers-reduced-motion: reduce) {
          .lp-nav-link, .lp-cta { transition: none; }
          .lp-stagger > * { opacity: 1; transform: none; }
        }
      `}</style>

      <div className={`lp-root ${interTight.variable}`}>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav>
          <div className="lp-container" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>nudge</span>
            <Link href="/login" className="lp-nav-link">sign in</Link>
          </div>
        </nav>

        {/* ── Hero — h1 + phone top-aligned, both inside the fade band ── */}
        <section className="lp-fade-band">
          <div className="lp-container" style={{ paddingTop: 56, paddingBottom: 120 }}>
            <div className="lp-hero-lower">

              {/* Left col: headline + subtext + CTA */}
              <div style={{ maxWidth: 520 }}>
                <h1 style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 'clamp(44px, 5.5vw, 76px)',
                  lineHeight: 1.0,
                  letterSpacing: '-0.04em',
                  margin: '0 0 24px',
                  color: '#fff',
                }}>
                  the nag you actually asked for.
                </h1>
                <p style={{
                  fontSize: 17,
                  lineHeight: 1.65,
                  color: '#8E8E93',
                  margin: '0 0 40px',
                  maxWidth: 400,
                }}>
                  Set a reminder by texting nudge your assignment and deadline.
                  It schedules the nagging and blows up your phone until you reply.
                  No app. Just iMessage.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
                  <a
                    href="imessage://hinudge@icloud.com"
                    className="lp-cta"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      background: '#007AFF',
                      color: '#fff',
                      fontSize: 16,
                      fontWeight: 600,
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      padding: '13px 28px',
                      borderRadius: 9999,
                      textDecoration: 'none',
                      letterSpacing: '-0.01em',
                      transition: 'background 0.15s',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                    text nudge
                  </a>
                  <code style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'var(--font-geist-mono, monospace)', userSelect: 'all' }}>
                    hinudge@icloud.com
                  </code>
                </div>
              </div>

              {/* Right col: phone */}
              <div className="lp-phone-col">
                <PhoneSplitDemo />
              </div>

            </div>
          </div>
        </section>

        {/* ── Light-mode sections ───────────────────────────────────────── */}
        <div className="lp-light">

          {/* ── Feature exchanges ──────────────────────────────────────── */}
          <section style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="lp-container" style={{ paddingTop: 64, paddingBottom: 96 }}>
              <RevealSection style={{ margin: '0 0 40px' }}>
                <p style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#0A84FF',
                  margin: 0,
                }}>
                  what nudge does
                </p>
              </RevealSection>
              <RevealSection stagger={140} className="lp-exchanges lp-stagger">
                {EXCHANGES.map((ex, ei) => {
                  return (
                    <div key={ei} className="lp-exchange-card">
                      {ex.messages.map((m, mi) => {
                        const prevFrom = mi > 0 ? ex.messages[mi - 1].from : null
                        const nextFrom = mi < ex.messages.length - 1 ? ex.messages[mi + 1].from : null
                        const isGrouped = prevFrom === m.from
                        const isLast = nextFrom !== m.from
                        return (
                          <Bubble
                            key={mi}
                            from={m.from}
                            text={m.text}
                            isGrouped={isGrouped}
                            isLast={isLast}
                          />
                        )
                      })}
                      <p className="lp-exchange-caption">{ex.caption}</p>
                    </div>
                  )
                })}
              </RevealSection>
            </div>
          </section>

          {/* ── How it works ─────────────────────────────────────────────── */}
          <section style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="lp-container" style={{ paddingTop: 64, paddingBottom: 96 }}>
              <RevealSection style={{ marginBottom: 48 }}>
                <h2
                  className="lp-light-text"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 'clamp(32px, 4vw, 48px)',
                    letterSpacing: '-0.04em',
                    margin: 0,
                  }}
                >
                  how it works.
                </h2>
              </RevealSection>
              <RevealSection stagger={140} className="lp-stagger">
                {[
                  "Text nudge what's due and when.",
                  'Nudge saves it and schedules the reminders.',
                  "Your phone doesn't stop until you reply.",
                ].map((step, i) => (
                  <div key={i} className="lp-step">
                    <span style={{
                      fontFamily: 'var(--font-geist-mono, monospace)',
                      fontSize: 12,
                      color: '#0A84FF',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      flexShrink: 0,
                      width: 28,
                      paddingTop: 2,
                    }}>
                      0{i + 1}
                    </span>
                    <span className="lp-light-text" style={{
                      fontSize: 'clamp(17px, 2vw, 22px)',
                      lineHeight: 1.4,
                    }}>
                      {step}
                    </span>
                  </div>
                ))}
              </RevealSection>
            </div>
          </section>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="lp-container" style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="lp-light-text" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>nudge</span>
              <Link href="/login" className="lp-nav-link">sign in</Link>
            </div>
          </footer>

        </div>{/* end .lp-light */}

      </div>
    </>
  )
}
