import * as React from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Center, Text3D } from '@react-three/drei'
import * as THREE from 'three'

import { cn } from '@/lib/utils'

const IDLE_SPIN_SPEED = 0.0035
const MAX_TILT = 0.5
const DRAG_ROTATION_SPEED = 0.01

interface DragState {
  dragging: boolean
  lastX: number
  lastY: number
  velocityY: number
  velocityX: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function RotatingWord(props: {
  dragState: React.RefObject<DragState>
  groupRef: React.RefObject<THREE.Group | null>
}) {
  useFrame(() => {
    const group = props.groupRef.current
    const state = props.dragState.current
    if (!group) return

    if (!state.dragging) {
      group.rotation.y += state.velocityY
      group.rotation.x = clamp(group.rotation.x + state.velocityX, -MAX_TILT, MAX_TILT)
      state.velocityY = THREE.MathUtils.lerp(state.velocityY, IDLE_SPIN_SPEED, 0.02)
      state.velocityX = THREE.MathUtils.lerp(state.velocityX, 0, 0.05)
    }
  })

  return (
    <group ref={props.groupRef}>
      <Center>
        <Text3D
          font="/fonts/helvetiker_bold.typeface.json"
          size={1}
          height={0.4}
          bevelEnabled
          bevelThickness={0.05}
          bevelSize={0.03}
          bevelSegments={4}
          curveSegments={8}
        >
          Framed
          <meshStandardMaterial color="#8b2fff" roughness={0.35} metalness={0.15} />
        </Text3D>
      </Center>
    </group>
  )
}

interface Logo3DProps {
  className?: string
}

function Logo3D(props: Logo3DProps) {
  const groupRef = React.useRef<THREE.Group>(null)
  const dragState = React.useRef<DragState>({
    dragging: false,
    lastX: 0,
    lastY: 0,
    velocityY: IDLE_SPIN_SPEED,
    velocityX: 0,
  })

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current.dragging = true
    dragState.current.lastX = event.clientX
    dragState.current.lastY = event.clientY
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current
    const group = groupRef.current
    if (!state.dragging || !group) return

    const deltaX = event.clientX - state.lastX
    const deltaY = event.clientY - state.lastY
    state.lastX = event.clientX
    state.lastY = event.clientY

    const rotationDeltaY = deltaX * DRAG_ROTATION_SPEED
    const rotationDeltaX = deltaY * DRAG_ROTATION_SPEED
    group.rotation.y += rotationDeltaY
    group.rotation.x = clamp(group.rotation.x + rotationDeltaX, -MAX_TILT, MAX_TILT)
    state.velocityY = rotationDeltaY
    state.velocityX = rotationDeltaX
  }

  function handlePointerEnd() {
    dragState.current.dragging = false
  }

  return (
    <div
      className={cn('h-40 w-full touch-none select-none', props.className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} />
        <directionalLight position={[-3, -2, -4]} intensity={0.3} />
        <React.Suspense fallback={null}>
          <RotatingWord dragState={dragState} groupRef={groupRef} />
        </React.Suspense>
      </Canvas>
    </div>
  )
}

export { Logo3D }
