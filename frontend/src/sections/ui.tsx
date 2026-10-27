import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react'

// Section index in the Linear "method" style: a number and a name, no dots, no pills.
export function Label({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="r text-[13px] tracking-[0.18em] uppercase text-[#F4F1EA]/40 mb-10 md:mb-14">
      <span className="text-[#F4F1EA]/70 mr-4">{n}</span>
      {children}
    </p>
  )
}

// Headline revealed line by line behind a mask. `dim` lines render at 45% like the hero's second line.
export function Lines({ lines, dim = [], className = '', delay = 0 }: { lines: string[]; dim?: number[]; className?: string; delay?: number }) {
  return (
    <span className={`block ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className="line-mask block overflow-hidden pb-[0.08em]">
          <span className={`line block ${dim.includes(i) ? 'text-[#F4F1EA]/45' : 'text-[#F4F1EA]'}`} style={{ '--i': i + delay } as CSSProperties}>
            {l}
          </span>
        </span>
      ))}
    </span>
  )
}

// Writes --sp (0..1) on the element while it crosses the viewport: 0 when its top reaches 70% of the
// viewport height, 1 when its bottom reaches it. Only runs while the element is on screen.
export function useScrollProgress(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const anchor = window.innerHeight * 0.7
      el.style.setProperty('--sp', Math.min(1, Math.max(0, (anchor - r.top) / r.height)).toFixed(4))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        window.addEventListener('scroll', onScroll, { passive: true })
        update()
      } else window.removeEventListener('scroll', onScroll)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

// Marks with data-active the child (matching `selector`) that crosses the middle of the viewport.
export function useActiveItem(ref: RefObject<HTMLElement>, selector: string) {
  useEffect(() => {
    const items = ref.current?.querySelectorAll(selector)
    if (!items?.length) return
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) e.target.toggleAttribute('data-active', e.isIntersecting)
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    items.forEach(i => io.observe(i))
    return () => io.disconnect()
  }, [ref, selector])
}
