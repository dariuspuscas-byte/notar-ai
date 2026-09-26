import { useState } from 'react'
import type { Case } from '../types/api'
import { formatDate } from '../lib/format'

interface CaseHeaderProps {
  theCase: Case
  actTypeName: string
  onRename: (name: string) => void
  /** Reports the not-yet-submitted name while editing (null when not editing),
   * so the page can save it if the user leaves mid-edit. */
  onDraftChange?: (name: string | null) => void
}

export function CaseHeader({ theCase, actTypeName, onRename, onDraftChange }: CaseHeaderProps) {
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
              onRename(name.trim() || 'New client')
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
              Save
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className="cursor-pointer text-[22px] font-bold text-gray-900"
              title="Click to rename"
              onClick={() => setEditing(true)}
            >
              {theCase.client_name || 'New client'}
            </h1>
            <span className="rounded px-2.5 py-1 text-xs font-semibold text-blue-700" style={{ background: '#E9F0FB' }}>
              {actTypeName}
            </span>
          </div>
        )}
        <span className="text-[13px] text-gray-500">
          Case #{theCase.id.slice(0, 8)} · opened {formatDate(theCase.created_at)}
        </span>
      </div>
    </div>
  )
}
