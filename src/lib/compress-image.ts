const MAX_AVATAR_BYTES = 300 * 1024
const MAX_AVATAR_DIMENSION = 512
const MIN_QUALITY = 0.3
const QUALITY_STEP = 0.15

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob failed'))
      },
      'image/jpeg',
      quality
    )
  })
}

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return file

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.9
  let blob = await canvasToBlob(canvas, quality)
  while (blob.size > MAX_AVATAR_BYTES && quality > MIN_QUALITY) {
    quality -= QUALITY_STEP
    blob = await canvasToBlob(canvas, quality)
  }
  return blob
}
