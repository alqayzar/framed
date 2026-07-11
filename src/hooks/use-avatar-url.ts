import * as React from 'react'

import { idbGet } from '@/lib/idb-store'
import { AVATAR_KEY } from '@/lib/profile-store'

function useAvatarUrl(): string | null {
  const [avatarBlob, setAvatarBlob] = React.useState<Blob | null>(null)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
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

  return avatarUrl
}

export { useAvatarUrl }
