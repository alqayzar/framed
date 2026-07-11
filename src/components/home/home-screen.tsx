import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { CartoonButton } from '@/components/home/cartoon-button'
import { JoinRoomDialog } from '@/components/home/join-room-dialog'
import { Logo } from '@/components/home/logo'
import { ProfileForm } from '@/components/home/profile-form'
import { generateRoomCode } from '@/lib/room-code'
import { saveRoomInfo } from '@/lib/room-store'

function HomeScreen() {
  const navigate = useNavigate()
  const [isJoinDialogOpen, setIsJoinDialogOpen] = React.useState(false)

  function handleJoinClick() {
    setIsJoinDialogOpen(true)
  }

  async function handleCreateRoom() {
    await saveRoomInfo({ role: 'host', code: generateRoomCode() })
    navigate('/room')
  }

  async function handleJoinRoom(code: string) {
    await saveRoomInfo({ role: 'guest', code })
    navigate('/room')
  }

  return (
    <main className="bg-grid flex min-h-svh flex-col items-center justify-center gap-10 bg-white p-6">
      <Logo />

      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <ProfileForm />

        <div className="flex w-full flex-col gap-3">
          <CartoonButton tone="purple" onClick={handleCreateRoom}>
            Créer
          </CartoonButton>
          <CartoonButton tone="red" onClick={handleJoinClick}>
            Rejoindre
          </CartoonButton>
        </div>
      </div>

      <JoinRoomDialog
        open={isJoinDialogOpen}
        onOpenChange={setIsJoinDialogOpen}
        onJoin={handleJoinRoom}
      />
    </main>
  )
}

export { HomeScreen }
