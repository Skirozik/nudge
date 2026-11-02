'use client'

import { useEffect, useState } from 'react'

// Opens Messages with the code typed in, once per visit so the back button
// doesn't bounce them straight back. Only on Apple devices: the handle is an
// iCloud email, which Android can't text. Link previews don't run JS, so they
// still show the page.
export function OpenMessages({ href, text }: { href: string; text: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // iPadOS reports itself as a Mac
    if (!/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) return
    try {
      if (sessionStorage.getItem(href)) return
      sessionStorage.setItem(href, '1')
    } catch {
      // Private mode can block storage; opening Messages still works
    }
    window.location.href = href
  }, [href])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Clipboard can be blocked; the text is still on the page to copy by hand
    }
  }

  return (
    <div className="flex flex-col gap-4 items-start">
      <a
        href={href}
        className="inline-flex items-center gap-2.5 bg-[#007AFF] hover:bg-[#0071E3] transition-colors text-white text-[16px] font-semibold px-7 py-3 rounded-full"
      >
        Open in Messages
      </a>
      <button
        type="button"
        onClick={copy}
        className="font-mono text-[22px] tracking-[0.08em] bg-[#111] border border-[#1E1E1E] rounded-lg px-5 py-3 hover:border-[#007AFF] transition-colors"
      >
        {text}
        <span className="block font-sans text-[12px] tracking-normal text-[#8E8E93] mt-1">
          {copied ? 'Copied' : 'Tap to copy'}
        </span>
      </button>
    </div>
  )
}
