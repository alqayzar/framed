import * as React from 'react'

import { cn } from '@/lib/utils'

type CartoonButtonTone = 'purple' | 'red' | 'green' | 'blue'

const TONE_CLASSES: Record<CartoonButtonTone, string> = {
  purple: 'bg-game-purple text-white',
  red: 'bg-game-red text-white',
  green: 'bg-game-green text-white',
  blue: 'bg-game-blue text-white',
}

interface CartoonButtonProps extends React.ComponentProps<'button'> {
  tone: CartoonButtonTone
}

function CartoonButton(props: CartoonButtonProps) {
  const { tone, className, type, children, ...rest } = props

  return (
    <button
      type={type ?? 'button'}
      className="group relative inline-flex w-full disabled:pointer-events-none disabled:opacity-50"
      {...rest}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-1 translate-y-1 rounded-2xl bg-game-ink"
      />
      <span
        className={cn(
          'relative flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-4 border-game-ink text-lg font-black transition-transform duration-100 group-active:translate-x-1 group-active:translate-y-1',
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
