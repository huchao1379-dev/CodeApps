import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface OverlayEntry {
  element: HTMLElement
  onClose: () => void
  previousFocus: HTMLElement | null
  previousAriaHidden: string | null
}

const overlayStack: OverlayEntry[] = []
let listeningDocument: Document | null = null

function focusableElements(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((item) => item.getClientRects().length > 0)
}

function focusOverlay(entry: OverlayEntry): void {
  const initial = entry.element.querySelector<HTMLElement>('[data-overlay-initial-focus]')
  const first = focusableElements(entry.element)[0]
  const target = initial ?? first ?? entry.element
  target.focus()
}

function syncOverlayVisibility(): void {
  const top = overlayStack[overlayStack.length - 1]
  overlayStack.forEach((entry) => {
    if (entry === top) {
      if (entry.previousAriaHidden === null) entry.element.removeAttribute('aria-hidden')
      else entry.element.setAttribute('aria-hidden', entry.previousAriaHidden)
    } else {
      entry.element.setAttribute('aria-hidden', 'true')
    }
  })
}

function handleOverlayKeyDown(event: KeyboardEvent): void {
  const active = overlayStack[overlayStack.length - 1]
  if (!active) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    active.onClose()
    return
  }

  if (event.key !== 'Tab') return
  const focusable = focusableElements(active.element)
  if (focusable.length === 0) {
    event.preventDefault()
    active.element.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const index = focusable.indexOf(document.activeElement as HTMLElement)
  if (event.shiftKey && index <= 0) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) {
    event.preventDefault()
    first.focus()
  }
}

function removeOverlay(entry: OverlayEntry): void {
  const wasTop = overlayStack[overlayStack.length - 1] === entry
  const index = overlayStack.indexOf(entry)
  if (index !== -1) overlayStack.splice(index, 1)
  if (entry.previousAriaHidden === null) entry.element.removeAttribute('aria-hidden')
  else entry.element.setAttribute('aria-hidden', entry.previousAriaHidden)
  syncOverlayVisibility()

  if (overlayStack.length === 0 && listeningDocument) {
    listeningDocument.removeEventListener('keydown', handleOverlayKeyDown, true)
    listeningDocument = null
  }

  if (!wasTop) return
  const next = overlayStack[overlayStack.length - 1]
  if (entry.previousFocus?.isConnected && (!next || next.element.contains(entry.previousFocus))) {
    entry.previousFocus.focus()
  } else if (next) {
    focusOverlay(next)
  }
}

export function useOverlayFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const elementRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const element = elementRef.current
    if (!open || !element) return undefined

    const entry: OverlayEntry = {
      element,
      onClose: () => onCloseRef.current(),
      previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      previousAriaHidden: element.getAttribute('aria-hidden'),
    }
    overlayStack.push(entry)
    syncOverlayVisibility()
    if (!listeningDocument) {
      listeningDocument = document
      listeningDocument.addEventListener('keydown', handleOverlayKeyDown, true)
    }
    focusOverlay(entry)

    return () => removeOverlay(entry)
  }, [open])

  return elementRef
}
