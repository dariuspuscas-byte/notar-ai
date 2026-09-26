import type { OverallStatus } from '../types/api'
import { AlertTriangleIcon, CheckCircleIcon, MessageIcon } from './icons'

interface StatusBannerProps {
  overallStatus: OverallStatus
  missingCount: number
  pendingReviewCount: number
  onGenerateMessage: () => void
  onMarkSigned: () => void
  markSignedDisabled?: boolean
}

function pluralDocs(count: number): string {
  return count === 1 ? 'missing document' : 'missing documents'
}

export function StatusBanner({
  overallStatus,
  missingCount,
  pendingReviewCount,
  onGenerateMessage,
  onMarkSigned,
  markSignedDisabled,
}: StatusBannerProps) {
  if (overallStatus === 'ready_to_sign') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          <CheckCircleIcon className="h-[22px] w-[22px] flex-shrink-0 text-emerald-700" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold text-emerald-900">
              Case complete · ready to sign
            </span>
            <span className="text-[13px] text-emerald-700">
              All documents have been received and confirmed
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={markSignedDisabled}
          onClick={onMarkSigned}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-[18px] py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 lg:w-auto"
        >
          <CheckCircleIcon className="h-4 w-4" />
          Mark case as signed
        </button>
      </div>
    )
  }

  const primaryLine =
    missingCount > 0
      ? `${missingCount} ${pluralDocs(missingCount)}`
      : `${pendingReviewCount} ${pendingReviewCount === 1 ? 'document' : 'documents'} awaiting confirmation`

  const secondaryLine =
    missingCount > 0 && pendingReviewCount > 0
      ? `+ ${pendingReviewCount} under review · the case cannot be signed yet`
      : missingCount > 0
        ? 'the case cannot be signed yet'
        : 'the case cannot be signed yet, awaiting confirmation'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3.5">
        <AlertTriangleIcon className="h-[22px] w-[22px] flex-shrink-0 text-amber-800" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold text-amber-900">{primaryLine}</span>
          <span className="text-[13px] text-amber-700">{secondaryLine}</span>
        </div>
      </div>
      {missingCount > 0 && (
        <button
          type="button"
          onClick={onGenerateMessage}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-amber-700 px-[18px] py-2.5 text-sm font-semibold text-white hover:bg-amber-800 lg:w-auto"
        >
          <MessageIcon className="h-4 w-4" />
          Generate message for client
        </button>
      )}
    </div>
  )
}
