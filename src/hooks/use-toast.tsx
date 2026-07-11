import * as React from 'react'

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 1800

interface ToastProviderProps {
  children: React.ReactNode
}

function ToastProvider(props: ToastProviderProps) {
  const [message, setMessage] = React.useState<string | null>(null)
  const timeoutRef = React.useRef<number | null>(null)

  const showToast = React.useCallback((nextMessage: string) => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    setMessage(nextMessage)
    timeoutRef.current = window.setTimeout(() => {
      setMessage(null)
      timeoutRef.current = null
    }, TOAST_DURATION_MS)
  }, [])

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const value = React.useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      {message && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-100 flex justify-center px-6">
          <div className="animate-in fade-in slide-in-from-bottom-2 rounded-full border-4 border-game-ink bg-white px-6 py-3 text-base font-bold text-game-ink shadow-[4px_4px_0_0_var(--color-game-ink)]">
            {message}
          </div>
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
