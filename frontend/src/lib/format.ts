export function formatConfidencePct(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return ''
  return `${Math.round(confidence * 100)}%`
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.round((now - then) / 1000))
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec} sec ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h ago`
  const diffD = Math.round(diffH / 24)
  return `${diffD} days ago`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
