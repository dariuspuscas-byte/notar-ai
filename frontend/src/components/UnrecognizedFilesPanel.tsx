import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document } from '../types/api'
import { formatFileSize, formatRelativeTime } from '../lib/format'
import { AnchoredPopover } from './AnchoredPopover'
import { AlertTriangleIcon, ChevronLeftIcon, ImageIcon } from './icons'
import type { ReassignOption } from './ChecklistRow'

interface UnrecognizedFilesPanelProps {
  documents: Document[]
  reassignOptions: ReassignOption[]
  fileUrls: Record<string, string | undefined>
  onAssign: (documentId: string, requiredDocumentTypeId: string) => void
  onDiscard: (documentId: string) => void
  onRetryClassification: (documentId: string) => void
  busy?: boolean
}

function UnrecognizedRow({
  doc,
  reassignOptions,
  fileUrl,
  onAssign,
  onDiscard,
  onRetryClassification,
  busy,
}: {
  doc: Document
  reassignOptions: ReassignOption[]
  fileUrl?: string
  onAssign: (documentId: string, requiredDocumentTypeId: string) => void
  onDiscard: (documentId: string) => void
  onRetryClassification: (documentId: string) => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const [showAssign, setShowAssign] = useState(false)
  const assignButtonRef = useRef<HTMLButtonElement>(null)
  const closeAssign = useCallback(() => setShowAssign(false), [])
  const isError = doc.status === 'pending_classification'

  return (
    <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0">
      {fileUrl ? (
        <img src={fileUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-gray-100">
          <ImageIcon className="h-4 w-4 text-gray-400" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-gray-800">{doc.original_filename}</span>
        <span className={`text-xs ${isError ? 'text-red-600' : 'text-gray-500'}`}>
          {formatFileSize(doc.file_size_bytes)} · {formatRelativeTime(doc.uploaded_at)}
          {isError &&
            ` · ${doc.classification_error ? doc.classification_error : t('unrecognizedFiles.classificationFailed')}`}
          {!isError && ` · ${t('unrecognizedFiles.noMatch')}`}
        </span>
      </div>
      {isError ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRetryClassification(doc.id)}
          className="flex-shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('unrecognizedFiles.retry')}
        </button>
      ) : (
        <div className="flex-shrink-0">
          <button
            ref={assignButtonRef}
            type="button"
            disabled={busy}
            aria-haspopup="true"
            aria-expanded={showAssign}
            onClick={() => setShowAssign((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('unrecognizedFiles.assign')}
          </button>
          {showAssign && (
            <AnchoredPopover anchorRef={assignButtonRef} onClose={closeAssign} align="right" className="w-64">
              {reassignOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onAssign(doc.id, opt.id)
                    setShowAssign(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  {opt.name}
                </button>
              ))}
            </AnchoredPopover>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onDiscard(doc.id)}
        className="flex-shrink-0 text-xs font-semibold text-gray-400 hover:text-gray-600 disabled:opacity-50"
      >
        {t('common.reject')}
      </button>
    </div>
  )
}

export function UnrecognizedFilesPanel({
  documents,
  reassignOptions,
  fileUrls,
  onAssign,
  onDiscard,
  onRetryClassification,
  busy,
}: UnrecognizedFilesPanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (documents.length === 0) return null

  const hasError = documents.some((d) => d.status === 'pending_classification')

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <AlertTriangleIcon
          className={`h-4 w-4 flex-shrink-0 ${hasError ? 'text-red-500' : 'text-gray-400'}`}
        />
        <span className="flex-1 text-sm font-semibold text-gray-700">
          {t('unrecognizedFiles.title', { count: documents.length })}
        </span>
        <ChevronLeftIcon className={`h-4 w-4 text-gray-400 transition-transform ${open ? '-rotate-90' : 'rotate-180'}`} />
      </button>
      {open && (
        <div>
          {documents.map((doc) => (
            <UnrecognizedRow
              key={doc.id}
              doc={doc}
              reassignOptions={reassignOptions}
              fileUrl={fileUrls[doc.id]}
              onAssign={onAssign}
              onDiscard={onDiscard}
              onRetryClassification={onRetryClassification}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  )
}
