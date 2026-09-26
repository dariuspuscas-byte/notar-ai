import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Case } from '../types/api'
import { formatDate } from '../lib/format'
import { DEFAULT_CLIENT_NAME } from '../api/cases'

interface CaseHeaderProps {
  theCase: Case
  actTypeName: string
  onRename: (name: string) => void
  /** Reports the not-yet-submitted name while editing (null when not editing),
   * so the page can save it if the user leaves mid-edit. */
  onDraftChange?: (name: string | null) => void
}

export function CaseHeader({ theCase, actTypeName, onRename, onDraftChange }: CaseHeaderProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(theCase.client_name)

  return (
    <div className="flex flex-col items-start justify-between gap-4 px-6 pb-[18px] pt-6 sm:flex-row sm:px-12">
      <div className="flex flex-col gap-1.5">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              onRename(name.trim() || DEFAULT_CLIENT_NAME)
              setEditing(false)
              onDraftChange?.(null)
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                onDraftChange?.(e.target.value)
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xl font-bold"
            />
            <button type="submit" className="text-sm font-semibold text-blue-700">
              {t('common.save')}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className="cursor-pointer text-[22px] font-bold text-gray-900"
              title={t('caseHeader.clickToRename')}
              onClick={() => setEditing(true)}
            >
              {theCase.client_name || t('common.newClient')}
            </h1>
            <span className="rounded px-2.5 py-1 text-xs font-semibold text-blue-700" style={{ background: '#E9F0FB' }}>
              {actTypeName}
            </span>
          </div>
        )}
        <span className="text-[13px] text-gray-500">
          {t('caseHeader.meta', { id: theCase.id.slice(0, 8), date: formatDate(theCase.created_at) })}
        </span>
      </div>
    </div>
  )
}
