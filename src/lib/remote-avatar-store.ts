import { idbGet, idbSet } from '@/lib/idb-store'

const REMOTE_AVATAR_PREFIX = 'remote-avatar:'

export function getCachedRemoteAvatar(peerId: string): Promise<Blob | undefined> {
  return idbGet<Blob>(REMOTE_AVATAR_PREFIX + peerId)
}

export function cacheRemoteAvatar(peerId: string, blob: Blob): Promise<void> {
  return idbSet(REMOTE_AVATAR_PREFIX + peerId, blob)
}
