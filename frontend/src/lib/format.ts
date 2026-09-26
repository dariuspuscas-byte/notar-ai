import i18n from '../i18n'

export function formatConfidencePct(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return ''
  return `${Math.round(confidence * 100)}%`
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.round((now - then) / 1000))
  if (diffSec < 10) return i18n.t('format.justNow')
  if (diffSec < 60) return i18n.t('format.secondsAgo', { count: diffSec })
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return i18n.t('format.minutesAgo', { count: diffMin })
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return i18n.t('format.hoursAgo', { count: diffH })
  const diffD = Math.round(diffH / 24)
  return i18n.t('format.daysAgo', { count: diffD })
}

/** Uses the active locale's `format.dateLocale` (e.g. `en-GB` for
 * "26 Sep 2026"), falling back to the i18n language itself. */
export function formatDate(iso: string): string {
  const locale = i18n.exists('format.dateLocale') ? i18n.t('format.dateLocale') : i18n.language
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return i18n.t('format.bytes', { value: bytes })
  if (bytes < 1024 * 1024) return i18n.t('format.kilobytes', { value: Math.round(bytes / 1024) })
  return i18n.t('format.megabytes', { value: (bytes / (1024 * 1024)).toFixed(1) })
}
