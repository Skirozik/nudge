'use client'

import { useEffect, useRef, type RefObject } from 'react'

interface IPhoneDemoProps {
  theme?: 'dark' | 'light'
  externalChatRef?: RefObject<HTMLElement | null>
}

const SCRIPT = [
  { from: 'me',   text: 'i have a bio exam friday at 8am' },
  { from: 'them', text: 'bio exam friday 8am — want me to really nag you on this one?' },
  { from: 'me',   text: 'yes lol' },
  { from: 'them', text: 'locked in 📱 blowing your phone up thursday. you asked for this' },
]

const T = {
  typing:      1400,
  beforeMe:     850,
  betweenMsgs: 1050,
  holdEnd:     3600,
  fade:         420,
}

export default function IPhoneDemo({ theme = 'dark', externalChatRef }: IPhoneDemoProps = {}) {
  const internalChatRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (externalChatRef) return // animation managed by parent

    const chatOrNull = internalChatRef.current
    if (!chatOrNull) return
    const chat: HTMLElement = chatOrNull

    let stopped = false
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

    function make(html: string): Element {
      const t = document.createElement('template')
      t.innerHTML = html.trim()
      return t.content.firstChild as Element
    }

    function scrollDown() {
      chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' })
    }

    function addBubble(
      m: { from: string; text: string },
      { groupStart, tail }: { groupStart: boolean; tail: boolean }
    ) {
      const row = make(
        `<div class="row ${m.from} ${groupStart ? 'group-start' : 'gt'} ${tail ? 'tail' : 'gb'}">
           <div class="bubble pop pop-origin"></div>
         </div>`
      )
      row.querySelector('.bubble')!.textContent = m.text
      chat.appendChild(row)
      scrollDown()
      return row
    }

    function showTyping() {
      const wrap = make(
        `<div class="row them">
           <div class="typing-wrap pop pop-origin">
             <div class="typing">
               <span class="dot"></span>
               <span class="dot"></span>
               <span class="dot"></span>
             </div>
           </div>
         </div>`
      )
      chat.appendChild(wrap)
      scrollDown()
      return wrap
    }

    function setDelivered(afterRow: Element) {
      chat.querySelectorAll('.delivered').forEach(el => el.remove())
      afterRow.insertAdjacentElement('afterend', make(`<div class="delivered">Delivered</div>`))
    }

    async function playOnce() {
      chat.innerHTML = `<div class="day-stamp"><b>Today</b> 11:23 AM</div>`
      let prev: string | null = null

      for (let i = 0; i < SCRIPT.length; i++) {
        if (stopped) return
        const m = SCRIPT[i]
        const next = SCRIPT[i + 1]
        const groupStart = m.from !== prev
        const tail = !next || next.from !== m.from

        if (m.from === 'them') {
          const typing = showTyping()
          await sleep(T.typing)
          if (stopped) return
          typing.remove()
        } else {
          await sleep(T.beforeMe)
        }

        if (stopped) return
        const row = addBubble(m, { groupStart, tail })
        if (m.from === 'me') {
          sleep(450).then(() => { if (!stopped) { setDelivered(row); scrollDown() } })
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
        chat.classList.add('clearing')
        await sleep(T.fade)
        if (stopped) return
        chat.classList.remove('clearing')
      }
    }

    loop()

    return () => {
      stopped = true
      chatOrNull.innerHTML = ''
      chatOrNull.classList.remove('clearing')
    }
  }, [externalChatRef])

  return (
    <>
      <div className="nudge-demo" data-theme={theme}>
        <div className="iphone" role="img" aria-label="iPhone showing a conversation with Nudge">
          <span className="btn action" />
          <span className="btn vol-up" />
          <span className="btn vol-down" />
          <span className="btn power" />

          <div className="bezel">
            <div className="screen">
              <div className="dynamic-island"><span className="cam" /></div>

              <div className="chrome">
                <div className="status-bar">
                  <span className="time">9:41</span>
                  <span className="levels">
                    <svg width="18" height="12" viewBox="0 0 18 12" fill="#FFF">
                      <rect x="0"  y="8"   width="3" height="4"   rx="1"/>
                      <rect x="5"  y="5.5" width="3" height="6.5" rx="1"/>
                      <rect x="10" y="3"   width="3" height="9"   rx="1"/>
                      <rect x="15" y="0"   width="3" height="12"  rx="1"/>
                    </svg>
                    <svg width="17" height="12" viewBox="0 0 17 12" fill="#FFF">
                      <path d="M8.5 12 L11.2 8.9 A4.4 4.4 0 0 0 5.8 8.9 Z"/>
                      <path d="M3.4 6.2 A7.7 7.7 0 0 1 13.6 6.2 L15.6 3.9 A10.9 10.9 0 0 0 1.4 3.9 Z"/>
                      <path d="M4.6 7.5 A5.6 5.6 0 0 1 12.4 7.5" stroke="#FFF" strokeWidth="2" fill="none"/>
                    </svg>
                    <svg width="27" height="13" viewBox="0 0 27 13">
                      <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="#FFF" strokeOpacity=".4"/>
                      <rect x="2" y="2" width="20" height="9" rx="2" fill="#FFF"/>
                      <path d="M25.5 4.5 a2.2 2.2 0 0 1 0 4" fill="#FFF" fillOpacity=".45"/>
                    </svg>
                  </span>
                </div>

                <div className="nav">
                  <span className="back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M7 1 L1.6 7 L7 13" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>3
                  </span>
                  <div className="contact">
                    <div className="avatar">N</div>
                    <span className="name">Nudge
                      <svg width="6" height="9" viewBox="0 0 6 9" fill="none">
                        <path d="M1 1 L5 4.5 L1 8" stroke="#8D8D93" strokeWidth="1.6"
                              strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span className="service">iMessage</span>
                  </div>
                  <span className="video">
                    <svg width="22" height="14" viewBox="0 0 22 14" fill="currentColor">
                      <rect x="0" y="0" width="14" height="14" rx="4"/>
                      <path d="M15 5 L20.4 1.6 A0.9 0.9 0 0 1 21.8 2.4 V11.6 A0.9 0.9 0 0 1 20.4 12.4 L15 9 Z"/>
                    </svg>
                  </span>
                </div>
              </div>

              <main className="chat" ref={externalChatRef ?? internalChatRef} aria-hidden="true" />

              <div className="composer">
                <div className="bar">
                  <span className="cbtn">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M7.5 1 V14 M1 7.5 H14" stroke="#FFF" strokeWidth="1.9" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <div className="field">
                    <span className="placeholder">iMessage</span>
                  </div>
                  <span className="cbtn">
                    <svg width="13" height="20" viewBox="0 0 13 20" fill="none">
                      <rect x="3.6" y="0.9" width="5.8" height="11.5" rx="2.9" stroke="#FFF" strokeWidth="1.7"/>
                      <path d="M1 9.5 a5.5 5.5 0 0 0 11 0 M6.5 15.5 V19" stroke="#FFF"
                            strokeWidth="1.7" strokeLinecap="round" fill="none"/>
                    </svg>
                  </span>
                </div>
                <div className="home-indicator" />
              </div>

            </div>
          </div>
        </div>
      </div>

      <style>{`
        .nudge-demo {
          --screen-bg: #000000;
          --sent:      #0A84FF;
          --recv:      #26262A;
          --meta-gray: #8D8D93;
          --chrome-btn:#202024;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                       "Helvetica Neue", "Segoe UI", Roboto, sans-serif;
        }

        /* ---------- iPhone frame ---------- */
        .nudge-demo .iphone {
          position: relative;
          width: 362px;
          height: 766px;
          border-radius: 58px;
          background: linear-gradient(145deg,
            #3E4147 0%, #1A1B1E 22%, #0B0C0E 55%, #26282C 88%, #34373C 100%);
          box-shadow:
            inset 0 0 1.5px rgba(255,255,255,.45),
            inset 0 0 6px rgba(255,255,255,.06),
            0 30px 60px -18px rgba(0,0,0,.7),
            0 12px 24px -12px rgba(0,0,0,.55);
          animation: nd-phone-float 3.5s ease-in-out infinite;
        }
        @keyframes nd-phone-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }

        .nudge-demo .btn {
          position: absolute;
          width: 3.5px;
          border-radius: 2px;
          background: linear-gradient(90deg, #34373C, #101114);
        }
        .nudge-demo .btn.action   { left: -3px; top: 130px; height: 24px; }
        .nudge-demo .btn.vol-up   { left: -3px; top: 182px; height: 46px; }
        .nudge-demo .btn.vol-down { left: -3px; top: 236px; height: 46px; }
        .nudge-demo .btn.power    {
          right: -3px; top: 212px; height: 84px;
          background: linear-gradient(90deg, #101114, #34373C);
        }

        .nudge-demo .bezel {
          position: absolute;
          inset: 3.5px;
          border-radius: 54.5px;
          background: #000;
        }
        .nudge-demo .screen {
          position: absolute;
          inset: 4.5px;
          border-radius: 48px;
          background: var(--screen-bg);
          overflow: hidden;
        }
        .nudge-demo .screen::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(120% 70% at 78% -12%,
              rgba(255,255,255,.085) 0%,
              rgba(255,255,255,.028) 42%,
              rgba(255,255,255,0) 68%),
            linear-gradient(180deg,
              rgba(255,255,255,.035) 0%,
              rgba(255,255,255,.012) 18%,
              rgba(255,255,255,0) 42%),
            linear-gradient(112deg,
              rgba(255,255,255,0) 12%,
              rgba(255,255,255,.03) 26%,
              rgba(255,255,255,.012) 38%,
              rgba(255,255,255,0) 50%);
          box-shadow: inset 0 1px 1px rgba(255,255,255,.05);
          pointer-events: none;
          z-index: 40;
        }

        /* ---------- Dynamic Island ---------- */
        .nudge-demo .dynamic-island {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 110px;
          height: 32px;
          border-radius: 16px;
          background: #050506;
          box-shadow: 0 0 0 1px rgba(255,255,255,.07);
          z-index: 30;
        }
        .nudge-demo .dynamic-island .cam {
          position: absolute;
          right: 9px; top: 50%;
          transform: translateY(-50%);
          width: 11px; height: 11px;
          border-radius: 50%;
          background: radial-gradient(circle at 38% 35%, #1E2A45 0%, #060A14 60%);
        }

        /* ---------- Status bar + nav ---------- */
        .nudge-demo .chrome {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 134px;
          background: rgba(12,12,14,.82);
          -webkit-backdrop-filter: blur(22px) saturate(180%);
          backdrop-filter: blur(22px) saturate(180%);
          box-shadow: 0 .33px 0 rgba(255,255,255,.12);
          z-index: 20;
        }
        .nudge-demo .status-bar {
          position: absolute;
          top: 15px; left: 0; right: 0;
          height: 22px;
        }
        .nudge-demo .status-bar .time {
          position: absolute;
          left: 36px;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -.2px;
          color: #FFF;
        }
        .nudge-demo .status-bar .levels {
          position: absolute;
          right: 27px; top: 3px;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .nudge-demo .nav {
          position: absolute;
          top: 50px; left: 0; right: 0; bottom: 0;
        }
        .nudge-demo .nav .back,
        .nudge-demo .nav .video {
          position: absolute;
          background: rgba(120,120,128,.2);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          border-radius: 17px;
        }
        .nudge-demo .nav .back {
          left: 12px; top: 22px;
          height: 34px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          color: #FFF;
          font-size: 13px;
          font-weight: 500;
        }
        .nudge-demo .nav .video {
          right: 14px; top: 22px;
          width: 44px; height: 34px;
          display: grid;
          place-items: center;
          color: #FFF;
        }
        .nudge-demo .contact {
          position: absolute;
          left: 50%; top: 0;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .nudge-demo .avatar {
          width: 42px; height: 42px;
          border-radius: 50%;
          background: linear-gradient(180deg, #A5ABB4 0%, #858B94 100%);
          color: #fff;
          font-size: 19px;
          font-weight: 500;
          display: grid;
          place-items: center;
        }
        .nudge-demo .contact .name {
          font-size: 13px;
          font-weight: 600;
          color: #FFF;
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .nudge-demo .contact .name svg { margin-top: 1px; }
        .nudge-demo .contact .service {
          font-size: 11px;
          color: var(--meta-gray);
          margin-top: -1px;
        }

        /* ---------- Chat area ---------- */
        .nudge-demo .chat {
          position: absolute;
          inset: 0;
          padding: 148px 16px 94px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          pointer-events: none;
          scrollbar-width: none;
          transition: opacity .4s ease;
        }
        .nudge-demo .chat::-webkit-scrollbar { display: none; }
        .nudge-demo .chat > :first-child { margin-top: auto; }
        .nudge-demo .chat.clearing { opacity: 0; }

        .nudge-demo .day-stamp {
          text-align: center;
          font-size: 11px;
          color: #98989D;
          margin: 4px 0 12px;
        }
        .nudge-demo .day-stamp b { font-weight: 600; }

        .nudge-demo .row {
          display: flex;
          margin-top: 2px;
        }
        .nudge-demo .row.group-start { margin-top: 10px; }
        .nudge-demo .row.me   { justify-content: flex-end; }
        .nudge-demo .row.them { justify-content: flex-start; }

        .nudge-demo .bubble {
          position: relative;
          max-width: 74%;
          padding: 7px 12px 8px;
          font-size: 15px;
          line-height: 20px;
          letter-spacing: -.1px;
          border-radius: 18px;
          word-wrap: break-word;
          color: #FFF;
        }
        .nudge-demo .me   .bubble { background: var(--sent); }
        .nudge-demo .them .bubble { background: var(--recv); }

        .nudge-demo .me.gt   .bubble { border-top-right-radius: 5px; }
        .nudge-demo .me.gb   .bubble { border-bottom-right-radius: 5px; }
        .nudge-demo .them.gt .bubble { border-top-left-radius: 5px; }
        .nudge-demo .them.gb .bubble { border-bottom-left-radius: 5px; }

        /* ---------- Bubble tails ---------- */
        .nudge-demo .tail .bubble::before,
        .nudge-demo .tail .bubble::after {
          content: "";
          position: absolute;
          bottom: 0;
          height: 20px;
        }
        .nudge-demo .me.tail .bubble::before {
          right: -8px; width: 20px;
          z-index: 0;
          background: var(--sent);
          border-bottom-left-radius: 15px;
        }
        .nudge-demo .me.tail .bubble::after {
          right: -10px; width: 10px;
          z-index: 1;
          background: var(--screen-bg);
          border-bottom-left-radius: 10px;
        }
        .nudge-demo .them.tail .bubble::before {
          left: -8px; width: 20px;
          z-index: 0;
          background: var(--recv);
          border-bottom-right-radius: 15px;
        }
        .nudge-demo .them.tail .bubble::after {
          left: -10px; width: 10px;
          z-index: 1;
          background: var(--screen-bg);
          border-bottom-right-radius: 10px;
        }

        .nudge-demo .delivered {
          text-align: right;
          font-size: 11px;
          color: var(--meta-gray);
          margin: 3px 3px 0 0;
          animation: nd-soft-in .3s ease both;
        }

        /* ---------- Typing indicator ---------- */
        .nudge-demo .typing-wrap {
          position: relative;
          margin: 10px 0 0;
          width: fit-content;
        }
        .nudge-demo .typing {
          display: flex;
          gap: 5px;
          align-items: center;
          background: var(--recv);
          border-radius: 18px;
          padding: 13px 14px;
        }
        .nudge-demo .typing .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #8E8E93;
          animation: nd-dot-pulse 1.3s infinite ease-in-out;
        }
        .nudge-demo .typing .dot:nth-child(2) { animation-delay: .18s; }
        .nudge-demo .typing .dot:nth-child(3) { animation-delay: .36s; }
        .nudge-demo .typing-wrap::before,
        .nudge-demo .typing-wrap::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          background: var(--recv);
        }
        .nudge-demo .typing-wrap::before { width: 11px; height: 11px; left: -1px; bottom: -2px; }
        .nudge-demo .typing-wrap::after  { width: 5px;  height: 5px;  left: -7px; bottom: -8px; }

        @keyframes nd-dot-pulse {
          0%, 60%, 100% { opacity: .35; transform: translateY(0); }
          30%           { opacity: 1;   transform: translateY(-2px); }
        }

        /* ---------- Bubble entrance ---------- */
        .nudge-demo .pop {
          animation: nd-send-in .38s cubic-bezier(.18,.89,.32,1.18) both;
        }
        .nudge-demo .me   .pop-origin { transform-origin: bottom right; }
        .nudge-demo .them .pop-origin { transform-origin: bottom left; }
        @keyframes nd-send-in {
          0%   { opacity: 0; transform: translateY(16px) scale(.88); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes nd-soft-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ---------- Composer + home indicator ---------- */
        .nudge-demo .composer {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 86px;
          background: rgba(12,12,14,.82);
          -webkit-backdrop-filter: blur(22px) saturate(180%);
          backdrop-filter: blur(22px) saturate(180%);
          box-shadow: 0 -.33px 0 rgba(255,255,255,.12);
          z-index: 20;
        }
        .nudge-demo .composer .bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px 0;
        }
        .nudge-demo .cbtn {
          width: 34px; height: 34px;
          flex: none;
          border-radius: 50%;
          background: var(--chrome-btn);
          display: grid;
          place-items: center;
        }
        .nudge-demo .field {
          flex: 1;
          height: 36px;
          border-radius: 18px;
          background: #0A0A0C;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
          display: flex;
          align-items: center;
          padding: 0 13px;
        }
        .nudge-demo .field .placeholder {
          font-size: 15px;
          color: #8D8D93;
        }
        .nudge-demo .home-indicator {
          position: absolute;
          left: 50%;
          bottom: 8px;
          transform: translateX(-50%);
          width: 120px; height: 5px;
          border-radius: 3px;
          background: #6E6E73;
        }

        @media (prefers-reduced-motion: reduce) {
          .nudge-demo .iphone { animation: none; }
          .nudge-demo .pop    { animation: nd-soft-in .2s ease both; }
          .nudge-demo .typing .dot { animation: none; opacity: .6; }
          .nudge-demo .chat   { transition: none; }
        }

        /* ── Light theme ── */
        .nudge-demo[data-theme="light"] {
          --screen-bg: #FFFFFF;
          --sent:      #007AFF;
          --recv:      #E9E9EB;
          --chrome-btn:#E5E5EA;
        }
        .nudge-demo[data-theme="light"] .them .bubble { color: #000; }
        .nudge-demo[data-theme="light"] .chrome {
          background: rgba(249,249,251,.9);
          box-shadow: 0 .33px 0 rgba(0,0,0,.12);
        }
        .nudge-demo[data-theme="light"] .status-bar .time { color: #000; }
        .nudge-demo[data-theme="light"] .status-bar .levels { filter: invert(1); }
        .nudge-demo[data-theme="light"] .nav .back  { color: #007AFF; }
        .nudge-demo[data-theme="light"] .nav .video { color: #000; }
        .nudge-demo[data-theme="light"] .contact .name { color: #000; }
        .nudge-demo[data-theme="light"] .contact .service { color: #636366; }
        .nudge-demo[data-theme="light"] .day-stamp { color: #636366; }
        .nudge-demo[data-theme="light"] .composer {
          background: rgba(249,249,251,.9);
          box-shadow: 0 -.33px 0 rgba(0,0,0,.12);
        }
        .nudge-demo[data-theme="light"] .field {
          background: #fff;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.15);
        }
        .nudge-demo[data-theme="light"] .home-indicator { background: rgba(0,0,0,.25); }
        .nudge-demo[data-theme="light"] .typing .dot   { background: #8E8E93; }
        .nudge-demo[data-theme="light"] .typing-wrap::before,
        .nudge-demo[data-theme="light"] .typing-wrap::after { background: #E9E9EB; }
      `}</style>
    </>
  )
}
