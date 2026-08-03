import * as React from 'react'
import { Circle, Square, Star, Triangle } from 'lucide-react'

import { type CubeColor } from '@/lib/cube-colors'
import { getObjectIconUrl, type ObjectType } from '@/lib/game-objects'
import { specialCellBackground, type CellShape } from '@/lib/special-cells'

// {{kind:value}} — deliberately doubled braces, distinct from the
// deleted Flows system's single-brace {variable} templating: this only
// ever marks "which visual asset goes here" inside an already-final
// text string (see game-actions.ts), never a variable to be looked up.
const PLACEHOLDER_PATTERN = /\{\{(\w+):([\w-]+)\}\}/g

// Same mapping as game-grid.tsx's GridShapeBadge — duplicated rather
// than shared, since this generic ui/ component shouldn't import from a
// waiting-room/ feature component, and special-cells.ts (where CellShape
// lives) is otherwise a plain data file with no lucide-react/React
// dependency.
const SHAPE_ICONS: Record<CellShape, React.ComponentType<{ className?: string }>> = {
  circle: Circle,
  triangle: Triangle,
  square: Square,
  star: Star,
}

interface PlaceholderTextProps {
  text: string
}

// The only job of this component: render text that may contain
// {{object:type}}/{{color:name}}/{{shape:name}} placeholders, swapping
// each one for its actual visual instead of showing the raw value. Used
// for action labels and toast messages alike — text with no
// placeholders in it renders through unchanged.
function PlaceholderText(props: PlaceholderTextProps) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of props.text.matchAll(PLACEHOLDER_PATTERN)) {
    if (match.index > lastIndex) parts.push(props.text.slice(lastIndex, match.index))
    const [full, kind, value] = match
    if (kind === 'object') {
      parts.push(
        <img
          key={key++}
          src={getObjectIconUrl(value as ObjectType)}
          alt={value}
          className="inline-block h-[1.4em] w-[1.4em] align-text-bottom"
        />
      )
    } else if (kind === 'color') {
      parts.push(
        <span
          key={key++}
          className="inline-block size-[1.4em] rounded-md border-2 border-game-ink align-text-bottom"
          style={{ backgroundColor: specialCellBackground(value as CubeColor) }}
        />
      )
    } else if (kind === 'shape') {
      const ShapeIcon = SHAPE_ICONS[value as CellShape]
      parts.push(
        <ShapeIcon key={key++} className="inline-block size-[1.4em] align-text-bottom" aria-hidden="true" />
      )
    } else {
      // Unrecognized placeholder kind: render the literal text so it
      // fails visibly instead of silently swallowing it.
      parts.push(full)
    }
    lastIndex = match.index + full.length
  }
  if (lastIndex < props.text.length) parts.push(props.text.slice(lastIndex))

  return <>{parts}</>
}

export { PlaceholderText }
