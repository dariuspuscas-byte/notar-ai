import { useTranslation } from 'react-i18next'
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

export function StatusBanner({
  overallStatus,
  missingCount,
  pendingReviewCount,
  onGenerateMessage,
  onMarkSigned,
  markSignedDisabled,
}: StatusBannerProps) {
  const { t } = useTranslation()

  if (overallStatus === 'ready_to_sign') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          <CheckCircleIcon className="h-[22px] w-[22px] flex-shrink-0 text-emerald-700" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold text-emerald-900">
              {t('statusBanner.readyTitle')}
            </span>
            <span className="text-[13px] text-emerald-700">
              {t('statusBanner.readySubtitle')}
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
          {t('statusBanner.markSigned')}
        </button>
      </div>
    )
  }

  const primaryLine =
    missingCount > 0
      ? t('statusBanner.missingDocuments', { count: missingCount })
      : t('statusBanner.awaitingConfirmation', { count: pendingReviewCount })

  const secondaryLine =
    missingCount > 0 && pendingReviewCount > 0
      ? t('statusBanner.underReviewCannotSign', { count: pendingReviewCount })
      : missingCount > 0
        ? t('statusBanner.cannotSign')
        : t('statusBanner.cannotSignAwaiting')

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
          {t('statusBanner.generateMessage')}
        </button>
      )}
    </div>
  )
}
