import { useEffect } from 'react'

let lockCount = 0
let previousBodyOverflow = ''
let previousHtmlOverflow = ''
let previousBodyPaddingRight = ''

function applyLock(): void {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  previousBodyOverflow = document.body.style.overflow
  previousHtmlOverflow = document.documentElement.style.overflow
  previousBodyPaddingRight = document.body.style.paddingRight
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
  document.documentElement.classList.add('ui-scroll-locked')
}

function releaseLock(): void {
  document.documentElement.style.overflow = previousHtmlOverflow
  document.body.style.overflow = previousBodyOverflow
  document.body.style.paddingRight = previousBodyPaddingRight
  document.documentElement.classList.remove('ui-scroll-locked')
}

/** Locks page/background scroll while an overlay is open. Supports nested overlays via ref-count. */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return undefined
    lockCount += 1
    if (lockCount === 1) applyLock()
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) releaseLock()
    }
  }, [locked])
}
