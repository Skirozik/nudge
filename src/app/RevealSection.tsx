'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** If set, direct children stagger by this many ms instead of the wrapper animating as one unit */
  stagger?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Scroll-reveal wrapper.
 * - Non-stagger: wraps children in a div that starts at opacity 0 / translateY(14px)
 *   and transitions in when 20% visible.
 * - Stagger: wrapper is always visible; DIRECT children start hidden (via CSS class
 *   `lp-stagger`) and reveal one by one with `stagger` ms delay between each.
 * - Animates once, then unobserves.
 * - prefers-reduced-motion: skips animation, shows immediately.
 */
export function RevealSection({ children, stagger, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (stagger) {
      const kids = Array.from(el.children) as HTMLElement[]
      if (reduced) {
        kids.forEach(ch => { ch.style.opacity = '1'; ch.style.transform = 'none' })
        return
      }
      const observer = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return
        kids.forEach((ch, i) => {
          setTimeout(() => {
            ch.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out'
            ch.style.opacity = '1'
            ch.style.transform = 'translateY(0)'
          }, i * stagger)
        })
        observer.unobserve(el)
      }, { threshold: 0.2 })
      observer.observe(el)
      return () => observer.disconnect()
    }

    // Non-stagger: animate the wrapper itself
    if (reduced) {
      el.style.opacity = '1'
      el.style.transform = 'none'
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      el.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
      observer.unobserve(el)
    }, { threshold: 0.2 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [stagger])

  if (stagger) {
    // Wrapper is always opaque; children start hidden via .lp-stagger CSS
    return (
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ opacity: 0, transform: 'translateY(14px)', ...style }}
    >
      {children}
    </div>
  )
}
