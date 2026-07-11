export type CubeColor = 'red' | 'purple' | 'green' | 'blue' | 'orange' | 'yellow'

const CUBE_COLORS: CubeColor[] = ['red', 'purple', 'green', 'blue', 'orange', 'yellow']

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
}

export function randomCubeColor(): CubeColor {
  return CUBE_COLORS[Math.floor(Math.random() * CUBE_COLORS.length)]
}
