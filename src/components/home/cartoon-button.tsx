import * as React from 'react'

import { cn } from '@/lib/utils'

type CartoonButtonTone = 'purple' | 'red' | 'green' | 'blue' | 'yellow'

const TONE_CLASSES: Record<CartoonButtonTone, string> = {
  purple: 'bg-game-purple text-white',
  red: 'bg-game-red text-white',
  green: 'bg-game-green text-white',
  blue: 'bg-game-blue text-white',
  yellow: 'bg-game-yellow text-game-ink',
}

interface CartoonButtonProps extends React.ComponentProps<'button'> {
  tone: CartoonButtonTone
  fullWidth?: boolean
}

function CartoonButton(props: CartoonButtonProps) {
  const { tone, className, type, children, fullWidth = true, ...rest } = props

  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'group relative inline-flex disabled:pointer-events-none disabled:opacity-50',
        fullWidth ? 'w-full' : 'w-auto'
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-full bg-game-ink"
      />
      <span
        className={cn(
          'relative flex h-16 items-center justify-center gap-2 overflow-hidden rounded-full border-4 border-game-ink px-8 text-2xl font-black transition-transform duration-100 group-active:translate-x-1.5 group-active:translate-y-1.5',
          fullWidth ? 'w-full' : 'w-auto',
          TONE_CLASSES[tone],
          className
        )}
      >
        {children}
      </span>
    </button>
  )
}

export { CartoonButton }
