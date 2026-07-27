import * as React from 'react'

import { getObjectIconUrl, type ObjectType } from '@/lib/game-objects'

// {{kind:value}} — deliberately doubled braces, distinct from the
// deleted Flows system's single-brace {variable} templating: this only
// ever marks "which visual asset goes here" inside an already-final
// text string (see game-actions.ts), never a variable to be looked up.
const PLACEHOLDER_PATTERN = /\{\{(\w+):([\w-]+)\}\}/g

interface PlaceholderTextProps {
  text: string
}

// The only job of this component: render text that may contain
// {{object:type}} placeholders, swapping each one for that object's
// actual icon instead of showing its raw type name. Used for action
// labels and toast messages alike — text with no placeholders in it
// renders through unchanged.
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
          className="inline-block h-[1em] w-[1em] align-text-bottom"
        />
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
