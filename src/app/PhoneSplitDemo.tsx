'use client'

import { useEffect, useRef } from 'react'
import IPhoneDemo from './IPhoneDemo'

const SCRIPT = [
  { from: 'me',   text: 'i have a bio exam friday at 8am' },
  { from: 'them', text: 'bio exam friday 8am — want me to really nag you on this one?' },
  { from: 'me',   text: 'yes lol' },
  { from: 'them', text: 'locked in 📱 blowing your phone up thursday. you asked for this' },
]

const T = { typing: 1400, beforeMe: 850, betweenMsgs: 1050, holdEnd: 3600, fade: 420 }

export default function PhoneSplitDemo() {
  const darkChatRef  = useRef<HTMLElement>(null)
  const lightChatRef = useRef<HTMLElement>(null)
  const wrapperRef   = useRef<HTMLDivElement>(null)
  const maskRef      = useRef<HTMLDivElement>(null)

  // Compute screen tone + content-flip mask from fade band geometry — load and resize only
  useEffect(() => {
    function updateMask() {
      const wrapper = wrapperRef.current
      const mask    = maskRef.current
      if (!wrapper || !mask) return

      const fadeBand = document.querySelector('.lp-fade-band') as HTMLElement | null
      if (!fadeBand) return

      const fadeRect    = fadeBand.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()

      // scrollY cancels in all subtractions below — no scroll listener needed
      const fadeBandH  = fadeRect.height
      const wrapperH   = wrapperRect.height

      // ── SCREEN TONE ─────────────────────────────────────────────────────────
      // Both screens get the page gradient aligned in document space so the
      // screen tone equals the page tone at every y. scrollY cancels:
      //   screenOffset = (wrapperRect.top + 4.5) - fadeRect.top  (no scrollY)
      const screenOffset = (wrapperRect.top + 4.5) - fadeRect.top  // 4.5px = bezel inset

      const useOklab =
        typeof CSS !== 'undefined' &&
        CSS.supports('background', 'linear-gradient(to bottom in oklab, #000, white)')
      const pageGrad = useOklab
        ? 'linear-gradient(to bottom in oklab, #000, #F2F3F4)'
        : 'linear-gradient(180deg,#000 0%,#0E0F11 28%,#2A2C2E 50%,#6B6E71 68%,#B4B6B8 84%,#F2F3F4 100%)'

      // Override .screen background-image via inline style (beats any CSS class rule).
      // Tail cutouts use --screen-bg (unchanged) which stays close to actual gradient
      // values at the message area — imperceptible at those small sizes.
      const darkScreen  = wrapper.querySelector('.screen') as HTMLElement | null
      const lightScreen = mask.querySelector('.screen')    as HTMLElement | null

      if (darkScreen) {
        darkScreen.style.backgroundImage    = pageGrad
        darkScreen.style.backgroundSize     = `100% ${fadeBandH}px`
        darkScreen.style.backgroundPosition = `0 ${-screenOffset}px`
        darkScreen.style.backgroundRepeat   = 'no-repeat'
      }
      if (lightScreen) {
        // +6% white lift makes it read as an emissive display, not a neutral surface
        lightScreen.style.backgroundImage    =
          `linear-gradient(rgba(255,255,255,.06),rgba(255,255,255,.06)),${pageGrad}`
        lightScreen.style.backgroundSize     = `100% 100%,100% ${fadeBandH}px`
        lightScreen.style.backgroundPosition = `0 0,0 ${-screenOffset}px`
        lightScreen.style.backgroundRepeat   = 'no-repeat'
      }

      // ── CONTENT FLIP (mask) ──────────────────────────────────────────────────
      // 78% through the fade band puts the centre near the chat/composer boundary —
      // page is clearly light (#A2A4A6+) and virtually no message bubble overlaps
      // the 80px transition band. scrollY cancels: splitRel = fadeBandH*0.78 + (fadeRect.top - wrapperRect.top)
      const splitRel  = fadeBandH * 0.78 + (fadeRect.top - wrapperRect.top)
      const topPct    = ((splitRel - 40) / wrapperH * 100).toFixed(1) + '%'
      const bottomPct = ((splitRel + 40) / wrapperH * 100).toFixed(1) + '%'

      const grad = `linear-gradient(to bottom, transparent ${topPct}, #000 ${bottomPct})`
      mask.style.maskImage       = grad
      mask.style.webkitMaskImage = grad
    }

    updateMask()
    window.addEventListener('resize', updateMask)
    return () => window.removeEventListener('resize', updateMask)
  }, [])

  // Single animation loop drives both chat panes
  useEffect(() => {
    const dOrNull = darkChatRef.current
    const lOrNull = lightChatRef.current
    if (!dOrNull || !lOrNull) return

    const dChat: HTMLElement = dOrNull
    const lChat: HTMLElement = lOrNull

    let stopped = false
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

    function make(html: string): Element {
      const t = document.createElement('template')
      t.innerHTML = html.trim()
      return t.content.firstChild as Element
    }

    function scrollBoth() {
      dChat.scrollTo({ top: dChat.scrollHeight, behavior: 'smooth' })
      lChat.scrollTo({ top: lChat.scrollHeight, behavior: 'smooth' })
    }

    function addBubble(
      m: { from: string; text: string },
      { groupStart, tail }: { groupStart: boolean; tail: boolean }
    ) {
      const cls = `row ${m.from} ${groupStart ? 'group-start' : 'gt'} ${tail ? 'tail' : 'gb'}`
      const makeRow = () => {
        const row = make(`<div class="${cls}"><div class="bubble pop pop-origin"></div></div>`)
        row.querySelector('.bubble')!.textContent = m.text
        return row as HTMLElement
      }
      const dRow = makeRow()
      const lRow = makeRow()
      dChat.appendChild(dRow)
      lChat.appendChild(lRow)
      scrollBoth()
      return { dRow, lRow }
    }

    function showTyping() {
      const makeWrap = () => make(
        `<div class="row them"><div class="typing-wrap pop pop-origin">` +
        `<div class="typing"><span class="dot"></span><span class="dot"></span>` +
        `<span class="dot"></span></div></div></div>`
      ) as HTMLElement
      const dWrap = makeWrap()
      const lWrap = makeWrap()
      dChat.appendChild(dWrap)
      lChat.appendChild(lWrap)
      scrollBoth()
      return { dWrap, lWrap }
    }

    function setDelivered(afterD: Element, afterL: Element) {
      dChat.querySelectorAll('.delivered').forEach(el => el.remove())
      lChat.querySelectorAll('.delivered').forEach(el => el.remove())
      afterD.insertAdjacentElement('afterend', make(`<div class="delivered">Delivered</div>`))
      afterL.insertAdjacentElement('afterend', make(`<div class="delivered">Delivered</div>`))
    }

    async function playOnce() {
      const stamp = `<div class="day-stamp"><b>Today</b> 11:23 AM</div>`
      dChat.innerHTML = stamp
      lChat.innerHTML = stamp
      let prev: string | null = null

      for (let i = 0; i < SCRIPT.length; i++) {
        if (stopped) return
        const m    = SCRIPT[i]
        const next = SCRIPT[i + 1]
        const groupStart = m.from !== prev
        const tail = !next || next.from !== m.from

        if (m.from === 'them') {
          const { dWrap, lWrap } = showTyping()
          await sleep(T.typing)
          if (stopped) return
          dWrap.remove()
          lWrap.remove()
        } else {
          await sleep(T.beforeMe)
        }

        if (stopped) return
        const { dRow, lRow } = addBubble(m, { groupStart, tail })
        if (m.from === 'me') {
          sleep(450).then(() => {
            if (!stopped) { setDelivered(dRow, lRow); scrollBoth() }
          })
        }
        prev = m.from
        await sleep(T.betweenMsgs)
      }
    }

    async function loop() {
      for (;;) {
        if (stopped) return
        await playOnce()
        if (stopped) return
        await sleep(T.holdEnd)
        if (stopped) return
        dChat.classList.add('clearing')
        lChat.classList.add('clearing')
        await sleep(T.fade)
        if (stopped) return
        dChat.classList.remove('clearing')
        lChat.classList.remove('clearing')
      }
    }

    loop()

    return () => {
      stopped = true
      dOrNull.innerHTML = ''
      lOrNull.innerHTML = ''
      dOrNull.classList.remove('clearing')
      lOrNull.classList.remove('clearing')
    }
  }, [])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Dark copy — always visible below */}
      <IPhoneDemo theme="dark" externalChatRef={darkChatRef} />

      {/* Light copy — sits on top, masked so it only shows where the page has lightened */}
      <div
        ref={maskRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', clipPath: 'inset(0 round 58px)' }}
      >
        <IPhoneDemo theme="light" externalChatRef={lightChatRef} />
      </div>
    </div>
  )
}
