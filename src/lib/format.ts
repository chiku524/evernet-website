export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

export function fileIconKind(
  mime: string,
  name: string,
): 'image' | 'video' | 'audio' | 'doc' | 'code' | 'archive' | 'file' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('zip') || mime.includes('tar') || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archive'
  if (
    /\.(ts|tsx|js|jsx|py|rs|go|json|md|css|html)$/i.test(name) ||
    mime.includes('javascript') ||
    mime.includes('json')
  )
    return 'code'
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text') || /\.(pdf|doc|txt|csv)$/i.test(name))
    return 'doc'
  return 'file'
}
