import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircleIcon, XIcon } from './icons'

interface ToastProps {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

/** Success toast that dismisses itself after `durationMs`. The live region is
 * always mounted (only its content toggles) so screen readers reliably
 * announce the message when it appears. */
export function Toast({ message, onDismiss, durationMs = 5000 }: ToastProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!message) return
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [message, onDismiss, durationMs])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-[72px] z-50 flex justify-center"
    >
      {message && (
        <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-emerald-700" />
          <span className="flex-1 text-sm font-semibold text-emerald-900">{message}</span>
          <button
            type="button"
            aria-label={t('toast.dismiss')}
            onClick={onDismiss}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
