import { idbDel, idbGet, idbSet } from '@/lib/idb-store'

const ROOM_ROLE_KEY = 'room:role'
const ROOM_CODE_KEY = 'room:code'

export interface StoredRoomInfo {
  role: 'host' | 'guest'
  code: string
}

export async function saveRoomInfo(info: StoredRoomInfo): Promise<void> {
  await idbSet(ROOM_ROLE_KEY, info.role)
  await idbSet(ROOM_CODE_KEY, info.code)
}

export async function loadRoomInfo(): Promise<StoredRoomInfo | null> {
  const role = await idbGet<StoredRoomInfo['role']>(ROOM_ROLE_KEY)
  const code = await idbGet<string>(ROOM_CODE_KEY)
  if (!role || !code) return null
  return { role, code }
}

export async function clearRoomInfo(): Promise<void> {
  await idbDel(ROOM_ROLE_KEY)
  await idbDel(ROOM_CODE_KEY)
}
