import * as React from 'react'

import { cn } from '@/lib/utils'

type CartoonButtonTone = 'purple' | 'orange' | 'cyan'

const TONE_CLASSES: Record<CartoonButtonTone, string> = {
  purple: 'bg-game-purple text-white',
  orange: 'bg-game-orange text-white',
  cyan: 'bg-game-cyan text-game-ink',
}

interface CartoonButtonProps extends React.ComponentProps<'button'> {
  tone: CartoonButtonTone
}

function CartoonButton(props: CartoonButtonProps) {
  const { tone, className, type, ...rest } = props

  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-[3px] border-game-ink text-lg font-black shadow-[4px_4px_0_0_var(--color-game-ink)] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-50',
        TONE_CLASSES[tone],
        className
      )}
      {...rest}
    />
  )
}

export { CartoonButton }
