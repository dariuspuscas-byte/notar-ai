import { useState } from 'react'
import type { Document } from '../types/api'
import { formatFileSize, formatRelativeTime } from '../lib/format'
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
  const [showAssign, setShowAssign] = useState(false)
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
          {isError && (doc.classification_error ? ` · ${doc.classification_error}` : ' · classification failed')}
          {!isError && ' · does not match any document in the list'}
        </span>
      </div>
      {isError ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRetryClassification(doc.id)}
          className="flex-shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Retry
        </button>
      ) : (
        <div className="relative flex-shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowAssign((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Assign
          </button>
          {showAssign && (
            <div className="absolute right-0 top-9 z-10 max-h-64 w-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
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
                  {opt.name_ro}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onDiscard(doc.id)}
        className="flex-shrink-0 text-xs font-semibold text-gray-400 hover:text-gray-600 disabled:opacity-50"
      >
        Reject
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
          Unrecognized files ({documents.length})
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
