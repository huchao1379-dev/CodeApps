import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ToastProps } from './Toast.types'

const DEFAULT_DURATION = 10_000

const TOAST_TITLES = {
  success: '操作成功',
  error: '操作失败',
  warning: '需要注意',
  info: '提示',
} as const

export function Toast({ kind, message, title, duration = DEFAULT_DURATION, onDismiss }: ToastProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(Math.ceil(duration / 1000))
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    setRemainingSeconds(Math.ceil(duration / 1000))
    const timer = window.setTimeout(() => onDismissRef.current(), Math.max(0, duration))
    const countdown = window.setInterval(() => setRemainingSeconds((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(countdown)
    }
  }, [duration, message])

  return <div className="ui-toast-viewport" aria-live={kind === 'error' ? 'assertive' : 'polite'}>
    <aside className={`ui-toast ui-toast-${kind}`} role={kind === 'error' ? 'alert' : 'status'} style={{ '--ui-toast-duration': `${Math.max(0, duration)}ms` } as CSSProperties}>
      <span className="ui-toast-icon" aria-hidden="true">{kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'warning' ? '!' : 'i'}</span>
      <div className="ui-toast-copy"><strong>{title ?? TOAST_TITLES[kind]}</strong><p>{message}</p></div>
      <small className="ui-toast-countdown" aria-hidden="true">{remainingSeconds}秒</small>
      <button className="ui-toast-dismiss" type="button" aria-label="关闭消息" onClick={onDismiss}>×</button>
      <span className="ui-toast-timer" aria-hidden="true" />
    </aside>
  </div>
}
