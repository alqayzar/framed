export type CubeColor =
  | 'red'
  | 'purple'
  | 'green'
  | 'blue'
  | 'orange'
  | 'yellow'
  | 'pink'
  | 'teal'
  | 'lime'
  | 'indigo'

export const CUBE_COLORS: CubeColor[] = [
  'red',
  'purple',
  'green',
  'blue',
  'orange',
  'yellow',
  'pink',
  'teal',
  'lime',
  'indigo',
]

interface CubeColorClasses {
  fill: string
  darkFill: string
}

export const CUBE_COLOR_CLASSES: Record<CubeColor, CubeColorClasses> = {
  red: { fill: 'fill-game-red', darkFill: 'fill-game-red-dark' },
  purple: { fill: 'fill-game-purple', darkFill: 'fill-game-purple-dark' },
  green: { fill: 'fill-game-green', darkFill: 'fill-game-green-dark' },
  blue: { fill: 'fill-game-blue', darkFill: 'fill-game-blue-dark' },
  orange: { fill: 'fill-game-orange', darkFill: 'fill-game-orange-dark' },
  yellow: { fill: 'fill-game-yellow', darkFill: 'fill-game-yellow-dark' },
  pink: { fill: 'fill-game-pink', darkFill: 'fill-game-pink-dark' },
  teal: { fill: 'fill-game-teal', darkFill: 'fill-game-teal-dark' },
  lime: { fill: 'fill-game-lime', darkFill: 'fill-game-lime-dark' },
  indigo: { fill: 'fill-game-indigo', darkFill: 'fill-game-indigo-dark' },
}

export function randomCubeColor(): CubeColor {
  return CUBE_COLORS[Math.floor(Math.random() * CUBE_COLORS.length)]
}

export interface CubeColorPalette {
  bg: string
  fg: string
}

// The game's actual palette as raw CSS values (not Tailwind classes), so
// it's usable in inline styles and SVG fill/stroke attributes — anywhere
// that needs to stay on-brand instead of generating arbitrary colors.
// Mirrors CartoonButton's tone text colors: white on every saturated cube
// color, dark ink on the lighter yellow.
export const CUBE_COLOR_PALETTE: Record<CubeColor, CubeColorPalette> = {
  red: { bg: 'var(--color-game-red)', fg: 'white' },
  purple: { bg: 'var(--color-game-purple)', fg: 'white' },
  green: { bg: 'var(--color-game-green)', fg: 'white' },
  blue: { bg: 'var(--color-game-blue)', fg: 'white' },
  orange: { bg: 'var(--color-game-orange)', fg: 'white' },
  yellow: { bg: 'var(--color-game-yellow)', fg: 'var(--color-game-ink)' },
  pink: { bg: 'var(--color-game-pink)', fg: 'white' },
  teal: { bg: 'var(--color-game-teal)', fg: 'white' },
  // Light like yellow: dark ink text stays readable on it.
  lime: { bg: 'var(--color-game-lime)', fg: 'var(--color-game-ink)' },
  indigo: { bg: 'var(--color-game-indigo)', fg: 'white' },
}

export function randomToastColors(): CubeColorPalette {
  return CUBE_COLOR_PALETTE[randomCubeColor()]
}
