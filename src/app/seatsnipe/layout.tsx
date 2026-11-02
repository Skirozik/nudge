import type { Metadata } from 'next'
import { Inter_Tight } from 'next/font/google'
import Link from 'next/link'
import { SEATSNIPE_SUPPORT_EMAIL, SEATSNIPE_URL } from '@/lib/seatsnipeBrand'

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-display',
  display: 'swap',
})

const DESCRIPTION = 'Text SeatSnipe a full class and it texts you when a seat opens. Works on iPhone.'

// The root layout's metadata is Nudge's, and iMessage link previews read this
export const metadata: Metadata = {
  metadataBase: new URL(SEATSNIPE_URL),
  title: { default: 'SeatSnipe: get a text when a seat opens', template: '%s | SeatSnipe' },
  description: DESCRIPTION,
  openGraph: { siteName: 'SeatSnipe', title: 'SeatSnipe: get a text when a seat opens', description: DESCRIPTION, type: 'website' },
}

export default function SeatSnipeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${interTight.variable} min-h-screen bg-[#080808] text-white flex flex-col antialiased`}
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <nav className="px-6 sm:px-10 h-16 flex items-center">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">
          seatsnipe
        </Link>
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="px-6 sm:px-10 py-10 border-t border-[#1E1E1E] text-[13px] text-[#8E8E93]">
        <div className="max-w-[720px] mx-auto space-y-3">
          <p>
            Questions? Email{' '}
            <a href={`mailto:${SEATSNIPE_SUPPORT_EMAIL}`} className="text-white/80 hover:text-white">
              {SEATSNIPE_SUPPORT_EMAIL}
            </a>
          </p>
          <p className="flex gap-5">
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
          </p>
          <p className="text-[#48484A]">SeatSnipe isn&apos;t run by or affiliated with any school.</p>
        </div>
      </footer>
    </div>
  )
}
