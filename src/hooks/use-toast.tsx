import * as React from 'react'
import { X } from 'lucide-react'

export interface ToastColors {
  fg?: string
  bg?: string
}

interface ToastContextValue {
  showToast: (message: string, colors?: ToastColors) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 1800
// Display cap only: the history itself is unbounded, so closing a visible
// toast reveals the next most recent one still alive.
const MAX_VISIBLE_TOASTS = 3

interface ToastEntry {
  id: number
  message: string
  colors?: ToastColors
}

interface ToastProviderProps {
  children: React.ReactNode
}

function ToastProvider(props: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([])
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

  const showToast = React.useCallback(
    (message: string, colors?: ToastColors) => {
      const id = nextIdRef.current++
      setToasts((current) => [...current, { id, message, colors }])
      // The lifetime starts at creation and runs even while the toast is
      // hidden beyond the display cap: expiry removes it from the whole
      // history, not just from the screen.
      const timeout = window.setTimeout(() => removeToast(id), TOAST_DURATION_MS)
      timeoutsRef.current.set(id, timeout)
    },
    [removeToast]
  )

  React.useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
      timeouts.clear()
    }
  }, [])

  const value = React.useMemo(() => ({ showToast }), [showToast])
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
              <span>{toast.message}</span>
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
