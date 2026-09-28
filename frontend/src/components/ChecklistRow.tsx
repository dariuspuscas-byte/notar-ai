import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseStatusChecklistItem, Document } from '../types/api'
import { formatConfidencePct } from '../lib/format'
import { StatusPill } from './StatusPill'
import {
  AlertTriangleIcon,
  CheckIcon,
  ImageIcon,
  NotApplicableIcon,
  UploadArrowIcon,
} from './icons'

// Stored with the review in the database (not shown in the UI), so it is kept
// as a fixed string rather than following the UI language.
const DEFAULT_REJECT_NOTE = 'Rejected by assistant'

export interface ReassignOption {
  id: string
  name: string
}

interface ChecklistRowProps {
  item: CaseStatusChecklistItem
  document?: Document
  fileUrl?: string
  reassignOptions: ReassignOption[]
  busy?: boolean
  onUploadForRow: (files: FileList) => void
  onConfirm: (documentId: string) => void
  onReassign: (documentId: string, requiredDocumentTypeId: string) => void
  onReject: (documentId: string, note: string) => void
  onMarkReceived: (note: string) => void
  onMarkNotApplicable: (note: string) => void
  onBringBack: () => void
}

function KebabMenu({
  onMarkReceived,
  onMarkNotApplicable,
}: {
  onMarkReceived: (note: string) => void
  onMarkNotApplicable: (note: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState<'received' | 'not_applicable' | null>(null)
  const [note, setNote] = useState('')

  if (prompt) {
    return (
      <div className="absolute right-0 top-9 z-10 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-gray-700">
          {prompt === 'received' ? t('checklist.markReceived') : t('checklist.markNotApplicable')}
        </p>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('checklist.notePlaceholder')}
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPrompt(null)
              setOpen(false)
              setNote('')
            }}
            className="rounded px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (prompt === 'received') onMarkReceived(note)
              else onMarkNotApplicable(note)
              setPrompt(null)
              setOpen(false)
              setNote('')
            }}
            className="rounded bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('checklist.moreActions')}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        &#8942;
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => setPrompt('received')}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('checklist.markReceived')}
          </button>
          <button
            type="button"
            onClick={() => setPrompt('not_applicable')}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('checklist.markNotApplicable')}
          </button>
        </div>
      )}
    </div>
  )
}

export function ChecklistRow({
  item,
  document,
  fileUrl,
  reassignOptions,
  busy,
  onUploadForRow,
  onConfirm,
  onReassign,
  onReject,
  onMarkReceived,
  onMarkNotApplicable,
  onBringBack,
}: ChecklistRowProps) {
  const { t } = useTranslation()
  const [showReassign, setShowReassign] = useState(false)
  const [showRejectNote, setShowRejectNote] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const mandatoryHint = !item.is_mandatory ? (
    <span className="text-gray-400"> {t('checklist.optional')}</span>
  ) : null

  if (item.status === 'not_applicable') {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50/70 px-[18px] py-[13px] opacity-75">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
          <NotApplicableIcon className="h-[18px] w-[18px] text-gray-400" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-gray-400 line-through">
            {item.name}
            {mandatoryHint}
          </span>
          <span className="text-[13px] text-gray-400">{t('checklist.markedNotRequired')}</span>
        </div>
        <StatusPill tone="dim">
          <NotApplicableIcon className="h-3 w-3" /> {t('checklist.notApplicable')}
        </StatusPill>
        <button
          type="button"
          onClick={onBringBack}
          className="w-[84px] text-right text-[13px] font-semibold text-gray-400 hover:text-gray-600"
        >
          {t('checklist.restore')}
        </button>
      </div>
    )
  }

  if (item.status === 'received') {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-[18px] py-[13px]">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-emerald-50">
          <CheckIcon className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-gray-900">
            {item.name}
            {mandatoryHint}
          </span>
          <span className="text-[13px] text-gray-500">
            {document?.status === 'confirmed'
              ? t('checklist.receivedManually')
              : t('checklist.receivedAutomatically')}
            {typeof item.confidence === 'number' ? ` (${formatConfidencePct(item.confidence)})` : ''}
          </span>
        </div>
        <StatusPill tone="green">
          <CheckIcon className="h-3 w-3" /> {t('checklist.received')}
        </StatusPill>
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="w-[84px] text-right text-[13px] font-semibold text-blue-700 hover:text-blue-900"
          >
            {t('checklist.view')}
          </a>
        ) : (
          <span className="w-[84px]" />
        )}
        <KebabMenu onMarkReceived={onMarkReceived} onMarkNotApplicable={onMarkNotApplicable} />
      </div>
    )
  }

  if (item.status === 'pending_review') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-[18px] py-[13px]">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-amber-100">
            <AlertTriangleIcon className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[15px] font-semibold text-gray-900">
                {item.name}
                {mandatoryHint}
              </span>
              <StatusPill tone="amber">{t('checklist.toConfirm')}</StatusPill>
            </div>
            <div className="flex items-center gap-2.5">
              {fileUrl ? (
                <a href={fileUrl} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  <img
                    src={fileUrl}
                    alt=""
                    className="h-[34px] w-[34px] rounded object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </a>
              ) : (
                <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded bg-gray-200">
                  <ImageIcon className="h-4 w-4 text-gray-500" />
                </div>
              )}
              <span className="text-[13px] text-amber-800">
                {t('checklist.suggestion', { confidence: formatConfidencePct(item.confidence) })}
                {document ? ` · ${document.original_filename}` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 lg:pl-14">
          <button
            type="button"
            disabled={busy}
            onClick={() => document && onConfirm(document.id)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50 lg:min-h-0 lg:flex-none"
          >
            <CheckIcon className="h-3.5 w-3.5" /> {t('common.confirm')}
          </button>
          <div className="relative flex-1 lg:flex-none">
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowReassign((s) => !s)}
              className="min-h-11 w-full rounded-md border border-amber-300 px-3 py-1.5 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 lg:min-h-0 lg:w-auto"
            >
              {t('checklist.chooseAnother')}
            </button>
            {showReassign && (
              <div className="absolute left-0 top-9 z-10 max-h-64 w-72 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {reassignOptions.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-500">{t('checklist.noOtherDocument')}</p>
                )}
                {reassignOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (document) onReassign(document.id, opt.id)
                      setShowReassign(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {opt.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!showRejectNote ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowRejectNote(true)}
              className="text-[13px] font-semibold text-gray-500 underline decoration-dotted hover:text-gray-700"
            >
              {t('common.reject')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t('checklist.rejectReasonPlaceholder')}
                className="rounded border border-gray-300 px-2 py-1 text-[13px]"
              />
              <button
                type="button"
                onClick={() => {
                  if (document) onReject(document.id, rejectNote || DEFAULT_REJECT_NOTE)
                  setShowRejectNote(false)
                  setRejectNote('')
                }}
                className="rounded bg-gray-700 px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-gray-800"
              >
                {t('common.confirm')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // status === 'missing'
  return (
    <div className="flex items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-white px-[18px] py-[13px]">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
        <UploadArrowIcon className="h-[18px] w-[18px] text-gray-400" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-gray-700">
          {item.name}
          {mandatoryHint}
        </span>
        <span className="text-[13px] text-gray-400">{t('checklist.notUploaded')}</span>
      </div>
      <StatusPill tone="grey">{t('checklist.missing')}</StatusPill>
      {/* Native <label> wrapping a visually hidden input: opens the picker on
          mobile without a programmatic input.click(). See UploadDropzone. */}
      <label className="relative flex min-h-11 w-[84px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-blue-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-blue-700 hover:bg-blue-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 lg:min-h-0">
        {t('checklist.upload')}
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onUploadForRow(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      <KebabMenu onMarkReceived={onMarkReceived} onMarkNotApplicable={onMarkNotApplicable} />
    </div>
  )
}
