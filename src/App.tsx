import * as React from 'react'

import { AvatarUploader } from '@/components/home/avatar-uploader'
import { CartoonButton } from '@/components/home/cartoon-button'
import { JoinRoomDialog } from '@/components/home/join-room-dialog'
import { Input } from '@/components/ui/input'

const LOGO_LETTERS = [
  { char: 'F', tone: 'text-game-purple' },
  { char: 'r', tone: 'text-game-red' },
  { char: 'a', tone: 'text-game-blue' },
  { char: 'm', tone: 'text-game-green' },
  { char: 'e', tone: 'text-game-purple' },
  { char: 'd', tone: 'text-game-red' },
]

function App() {
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState('')
  const [isJoinDialogOpen, setIsJoinDialogOpen] = React.useState(false)

  function handleUsernameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setUsername(event.target.value)
  }

  function handleJoinClick() {
    setIsJoinDialogOpen(true)
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 bg-white p-6">
      <div className="flex flex-col items-center gap-1">
        <h1 className="comic-title font-logo text-7xl font-bold tracking-tight">
          {LOGO_LETTERS.map((letter) => (
            <span key={letter.char} className={letter.tone}>
              {letter.char}
            </span>
          ))}
        </h1>
        <p className="text-base font-semibold text-muted-foreground">
          Le jeu de déduction sociale entre amis
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <AvatarUploader imageUrl={avatarUrl} onImageChange={setAvatarUrl} />

        <Input
          value={username}
          onChange={handleUsernameChange}
          placeholder="Ton pseudo"
          maxLength={20}
          autoComplete="off"
          className="h-14 rounded-full border-4 border-game-ink bg-white text-center text-xl font-bold text-game-ink placeholder:text-muted-foreground/50 focus-visible:ring-game-purple/40"
        />

        <div className="flex w-full flex-col gap-3">
          <CartoonButton tone="purple">Créer</CartoonButton>
          <CartoonButton tone="red" onClick={handleJoinClick}>
            Rejoindre
          </CartoonButton>
        </div>
      </div>

      <JoinRoomDialog
        open={isJoinDialogOpen}
        onOpenChange={setIsJoinDialogOpen}
      />
    </main>
  )
}

export default App
