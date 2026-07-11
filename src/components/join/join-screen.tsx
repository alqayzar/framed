import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { CartoonButton } from '@/components/home/cartoon-button'
import { Logo } from '@/components/home/logo'
import { ProfileForm } from '@/components/home/profile-form'
import { Badge } from '@/components/ui/badge'
import { saveRoomInfo } from '@/lib/room-store'

function JoinScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const code = (searchParams.get('code') ?? '').toUpperCase()

  React.useEffect(() => {
    if (!code) navigate('/', { replace: true })
  }, [code, navigate])

  async function handleJoinRoom() {
    await saveRoomInfo({ role: 'guest', code })
    navigate('/room')
  }

  if (!code) return null

  return (
    <main className="bg-grid flex min-h-svh flex-col items-center justify-center gap-10 bg-white p-6">
      <Logo />

      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <ProfileForm />

        <div className="flex w-full flex-col items-center gap-3">
          <CartoonButton tone="red" onClick={handleJoinRoom}>
            Rejoindre
            <Badge
              variant="outline"
              className="h-auto rounded-full border-game-ink/30 px-4 py-1.5 text-sm font-semibold tracking-[0.2em] text-white"
            >
              {code}
            </Badge>
          </CartoonButton>
        </div>
      </div>
    </main>
  )
}

export { JoinScreen }
