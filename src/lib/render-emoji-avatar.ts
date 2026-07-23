const AVATAR_SIZE = 512

// Turns a single emoji into an ordinary avatar Blob, the same shape
// compress-image.ts produces from a photo — so an emoji avatar is
// indistinguishable from a photo one to every downstream consumer
// (IndexedDB storage, PeerJS transport, remote caching, rendering).
export async function renderEmojiAvatar(emoji: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  context.font = `${AVATAR_SIZE * 0.7}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  // Emoji glyphs typically sit slightly high within their line box —
  // nudge down a touch so they look vertically centered.
  context.fillText(emoji, AVATAR_SIZE / 2, AVATAR_SIZE / 2 + AVATAR_SIZE * 0.05)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))), 'image/png')
  })
}
