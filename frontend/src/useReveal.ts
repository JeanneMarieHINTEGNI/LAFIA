import { useEffect, useRef } from 'react'

// Toggles `data-in` while the element is in the viewport (reveals, see `.r`, `.line` in index.css), so the
// animations replay every time a section comes back on screen, scrolling down OR up.
// `data-visible` lets looping animations pause offscreen (see `.loop`).
// Enters as soon as the top of the element passes 85% of the viewport height, so tall sections reveal too.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        el.toggleAttribute('data-in', e.isIntersecting)
        el.toggleAttribute('data-visible', e.isIntersecting)
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}
