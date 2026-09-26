import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SpinnerIcon } from './icons'
import { StatusPill } from './StatusPill'

interface InFlightUploadRowProps {
  filenames: string[]
  startedAt: number
  error?: string
  onDismiss?: () => void
}

/**
 * Represents files whose upload+classify request (§3.3) is still in flight.
 *
 * The documented API classifies synchronously within the POST /documents
 * request, so there's no server-pushed "verifying" state per checklist row —
 * the whole multi-file request either succeeds or fails as a batch, and we
 * only learn which checklist item each file matched once it resolves. This
 * component renders the UX spec's "Verifying" treatment for that in-flight
 * window at the client-transport level, then disappears once the response
 * lands and the real checklist/document queries refetch.
 */
export function InFlightUploadRow({ filenames, startedAt, error, onDismiss }: InFlightUploadRowProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSec = Math.round((now - startedAt) / 1000)

  if (error) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-red-200 bg-red-50 px-[18px] py-[13px]">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-red-100">
          <span className="text-lg text-red-600">!</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-red-800">{filenames.join(', ')}</span>
          <span className="text-[13px] text-red-600">{error}</span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[13px] font-semibold text-red-700 hover:text-red-900"
          >
            {t('common.close')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-[18px] py-[13px]">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-blue-50">
        <SpinnerIcon className="h-[18px] w-[18px] text-blue-600" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-gray-900">{filenames.join(', ')}</span>
        <span className="text-[13px] text-gray-500">{t('inFlightUpload.verifyingDetail', { seconds: elapsedSec })}</span>
      </div>
      <StatusPill tone="blue">
        <SpinnerIcon className="h-3 w-3" /> {t('inFlightUpload.verifying')}
      </StatusPill>
    </div>
  )
}
