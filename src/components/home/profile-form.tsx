import * as React from 'react'

import { AvatarUploader } from '@/components/home/avatar-uploader'
import { Input } from '@/components/ui/input'
import { compressImage } from '@/lib/compress-image'
import { idbGet, idbSet } from '@/lib/idb-store'
import { AVATAR_KEY, USERNAME_KEY } from '@/lib/profile-store'

function ProfileForm() {
  const [avatarBlob, setAvatarBlob] = React.useState<Blob | null>(null)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState('')

  React.useEffect(() => {
    idbGet<string>(USERNAME_KEY).then((value) => {
      if (value !== undefined) setUsername(value)
    })
    idbGet<Blob>(AVATAR_KEY).then((value) => {
      if (value !== undefined) setAvatarBlob(value)
    })
  }, [])

  React.useEffect(() => {
    if (!avatarBlob) {
      setAvatarUrl(null)
      return
    }
    const url = URL.createObjectURL(avatarBlob)
    setAvatarUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [avatarBlob])

  function handleUsernameChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setUsername(value)
    void idbSet(USERNAME_KEY, value)
  }

  async function handleAvatarSelected(file: File) {
    const compressed = await compressImage(file)
    setAvatarBlob(compressed)
    void idbSet(AVATAR_KEY, compressed)
  }

  return (
    <>
      <AvatarUploader imageUrl={avatarUrl} onFileSelected={handleAvatarSelected} />

      <Input
        value={username}
        onChange={handleUsernameChange}
        placeholder="Ton pseudo"
        maxLength={20}
        autoComplete="off"
        className="h-14 rounded-full border-4 border-game-ink bg-white text-center text-xl font-bold text-game-ink placeholder:text-muted-foreground/50 focus-visible:ring-game-purple/40"
      />
    </>
  )
}

export { ProfileForm }
