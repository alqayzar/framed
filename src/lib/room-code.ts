const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 6

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function extractRoomCodeFromLink(link: string): string | null {
  const normalizedLink = link.trim()

  if (/^[A-Z0-9]{1,6}$/i.test(normalizedLink)) {
    return normalizedLink.toUpperCase()
  }

  try {
    const parsed = new URL(normalizedLink)
    const directCode = parsed.searchParams.get('code')
    if (directCode) return directCode.toUpperCase()

    const hashFragment = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
    if (!hashFragment) return null

    const hashUrl = new URL(hashFragment, `${parsed.origin}${parsed.pathname}`)
    const hashCode = hashUrl.searchParams.get('code')
    if (hashCode) return hashCode.toUpperCase()
  } catch {
    // fall back to manual parsing for hash-based URLs that do not parse as full URLs
  }

  try {
    const hashMatch = normalizedLink.match(/[?&]code=([A-Z0-9]{1,6})/i)
    if (hashMatch?.[1]) return hashMatch[1].toUpperCase()
  } catch {
    // ignore
  }

  return null
}
