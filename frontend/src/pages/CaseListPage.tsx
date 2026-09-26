import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useActTypes } from '../api/actTypes'
import { useCases } from '../api/cases'
import { StatusPill, type PillTone } from '../components/StatusPill'
import { Toast } from '../components/Toast'
import type { OverallStatus } from '../types/api'
import { formatDate } from '../lib/format'

const STATUS_TONE: Record<OverallStatus, PillTone> = {
  ready_to_sign: 'green',
  missing_documents: 'amber',
  pending_review: 'blue',
}

/** Navigation state other pages can pass to show a toast on arrival. */
export interface CaseListLocationState {
  toast?: string
}

export default function CaseListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [toast, setToast] = useState(
    () => (location.state as CaseListLocationState | null)?.toast ?? null,
  )
  const dismissToast = useCallback(() => setToast(null), [])
  const { data: cases, isLoading } = useCases()
  const { data: actTypes } = useActTypes()
  const [search, setSearch] = useState('')

  const actTypeNameById = useMemo(() => {
    const map = new Map<string, string>()
    actTypes?.forEach((at) => map.set(at.id, at.name))
    return map
  }, [actTypes])

  // Drop the toast from history state so a reload/back doesn't show it again.
  useEffect(() => {
    if ((location.state as CaseListLocationState | null)?.toast) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  const filtered = useMemo(() => {
    if (!cases) return []
    const term = search.trim().toLowerCase()
    if (!term) return cases
    return cases.filter((c) => c.client_name.toLowerCase().includes(term))
  }, [cases, search])

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="flex h-[60px] items-center justify-between border-b border-gray-200 bg-white px-6 sm:px-12">
        <span className="text-[15px] font-bold text-gray-900">{t('common.appTitle')}</span>
        <span className="text-sm text-gray-500">
          {t('caseList.activeCases', { count: cases?.length ?? 0 })}
        </span>
      </div>

      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-8 sm:px-12">
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('caseList.searchPlaceholder')}
            className="min-h-11 flex-1 rounded-md border border-gray-300 px-3.5 text-sm focus:border-blue-500 focus:outline-none sm:max-w-sm"
          />
          <button
            type="button"
            onClick={() => navigate('/new')}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {t('caseList.newCase')}
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {isLoading && <p className="p-6 text-sm text-gray-500">{t('caseList.loading')}</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-6 text-sm text-gray-500">
              {search ? t('caseList.noMatches') : t('caseList.empty')}
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/cases/${c.id}`)}
              className="flex w-full items-center gap-4 border-t border-gray-100 px-5 py-4 text-left first:border-t-0 hover:bg-gray-50"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold text-gray-900">
                  {c.client_name || t('common.newClient')}
                </span>
                <span className="text-[13px] text-gray-500">
                  {t('caseList.meta', {
                    actType: actTypeNameById.get(c.act_type_id) ?? '—',
                    date: formatDate(c.updated_at),
                  })}
                </span>
              </div>
              <StatusPill tone={STATUS_TONE[c.status]}>{t(`caseList.status.${c.status}`)}</StatusPill>
            </button>
          ))}
        </div>
      </div>

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  )
}
