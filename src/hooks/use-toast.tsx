import * as React from 'react'
import { X } from 'lucide-react'

import { PlaceholderText } from '@/components/ui/placeholder-text'

export interface ToastColors {
  fg?: string
  bg?: string
}

export interface ToastOptions {
  key?: string
  colors?: ToastColors
  durationMs?: number
  // Survives a clearToasts() call — for messages that must still be
  // visible after whatever triggered the clear (e.g. "you were
  // kicked", shown just before leaving the room). Still disappears
  // normally via its own durationMs, just not from clearToasts().
  sticky?: boolean
}

interface ToastContextValue {
  showToast: (text: string, options?: ToastOptions) => void
  clearToasts: () => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 1800
// A self-documenting way to ask for "never auto-dismiss" instead of a
// bare Infinity at call sites — see showToast's durationMs param.
export const TOAST_LIFETIME_INFINITE = Infinity
// Display cap only: the history itself is unbounded, so closing a visible
// toast reveals the next most recent one still alive.
const MAX_VISIBLE_TOASTS = 3

interface ToastEntry {
  id: number
  key?: string
  text: string
  colors?: ToastColors
  // Stored so a re-broadcast that omits durationMs can "reset the
  // previous timer" using whatever duration this toast already had
  // (including Infinity), instead of falling back to the app default.
  durationMs: number
  sticky?: boolean
}

interface ToastProviderProps {
  children: React.ReactNode
}

function ToastProvider(props: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([])
  // Shadows toasts state so showToast can look up an existing entry by
  // key without needing toasts in its own dependency array.
  const toastsRef = React.useRef<ToastEntry[]>(toasts)
  toastsRef.current = toasts
  const nextIdRef = React.useRef(0)
  const timeoutsRef = React.useRef(new Map<number, number>())

  const removeToast = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timeout = timeoutsRef.current.get(id)
    if (timeout !== undefined) {
      window.clearTimeout(timeout)
      timeoutsRef.current.delete(id)
    }
  }, [])

  // The lifetime starts (or restarts, for an update) from now and runs
  // even while the toast is hidden beyond the display cap: expiry
  // removes it from the whole history, not just from the screen.
  // Infinite (or any non-finite) duration just never gets a timeout —
  // the close button (see removeToast) is still always available.
  const scheduleTimeout = React.useCallback(
    (id: number, durationMs: number) => {
      const existingTimeout = timeoutsRef.current.get(id)
      if (existingTimeout !== undefined) window.clearTimeout(existingTimeout)
      timeoutsRef.current.delete(id)
      if (Number.isFinite(durationMs)) {
        const timeout = window.setTimeout(() => removeToast(id), durationMs)
        timeoutsRef.current.set(id, timeout)
      }
    },
    [removeToast]
  )

  const showToast = React.useCallback(
    (text: string, options: ToastOptions = {}) => {
      const existing = options.key ? toastsRef.current.find((toast) => toast.key === options.key) : undefined
      if (existing) {
        const durationMs = options.durationMs ?? existing.durationMs
        const updated: ToastEntry = {
          ...existing,
          text,
          colors: options.colors ?? existing.colors,
          durationMs,
          sticky: options.sticky ?? existing.sticky,
        }
        // Drop wherever it was and append at the end — always moves an
        // updated toast to the most-recent position, which is also what
        // makes one that had scrolled outside MAX_VISIBLE_TOASTS visible
        // again (see the .slice(-MAX_VISIBLE_TOASTS) below).
        setToasts((current) => [...current.filter((toast) => toast.id !== existing.id), updated])
        scheduleTimeout(existing.id, durationMs)
        return
      }
      const id = nextIdRef.current++
      const durationMs = options.durationMs ?? TOAST_DURATION_MS
      setToasts((current) => [
        ...current,
        { id, key: options.key, text, colors: options.colors, durationMs, sticky: options.sticky },
      ])
      scheduleTimeout(id, durationMs)
    },
    [scheduleTimeout]
  )

  // Removes every non-sticky toast (and its timeout) — used when leaving
  // a room, so lingering room-scoped toasts don't stay on screen after
  // navigating away, while a toast explicitly marked sticky (e.g. "you
  // were kicked") survives to still be seen on the next screen.
  const clearToasts = React.useCallback(() => {
    setToasts((current) => {
      for (const toast of current) {
        if (toast.sticky) continue
        const timeout = timeoutsRef.current.get(toast.id)
        if (timeout !== undefined) {
          window.clearTimeout(timeout)
          timeoutsRef.current.delete(toast.id)
        }
      }
      return current.filter((toast) => toast.sticky)
    })
  }, [])

  React.useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
      timeouts.clear()
    }
  }, [])

  const value = React.useMemo(() => ({ showToast, clearToasts }), [showToast, clearToasts])
  const visibleToasts = toasts.slice(-MAX_VISIBLE_TOASTS)

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      {visibleToasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-100 flex flex-col gap-2 px-6">
          {visibleToasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                backgroundColor: toast.colors?.bg ?? 'white',
                color: toast.colors?.fg ?? 'var(--color-game-ink)',
              }}
              className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex w-full items-center justify-between rounded-full border-4 border-game-ink py-3 pr-3 pl-6 text-base font-bold shadow-[4px_4px_0_0_var(--color-game-ink)]"
            >
              <span>
                <PlaceholderText text={toast.text} />
              </span>
              <button
                type="button"
                aria-label="Fermer la notification"
                onClick={() => removeToast(toast.id)}
                className="cursor-pointer rounded-full p-1 transition-colors hover:bg-black/10"
              >
                <X className="size-4" strokeWidth={3} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  return context
}

export { ToastProvider, useToast }
