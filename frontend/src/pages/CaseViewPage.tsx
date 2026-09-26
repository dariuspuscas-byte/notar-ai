import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CaseListLocationState } from './CaseListPage'
import { useActTypes } from '../api/actTypes'
import { useCase, useCaseStatus, useUpdateCase, useValidateCase } from '../api/cases'
import {
  useClassifyDocument,
  useDocuments,
  useReviewDocument,
  useUploadDocuments,
} from '../api/documents'
import { useSetChecklistOverride } from '../api/checklist'
import { CaseHeader } from '../components/CaseHeader'
import { StatusBanner } from '../components/StatusBanner'
import { UploadDropzone } from '../components/UploadDropzone'
import { ChecklistRow, type ReassignOption } from '../components/ChecklistRow'
import { InFlightUploadRow } from '../components/InFlightUploadRow'
import { UnrecognizedFilesPanel } from '../components/UnrecognizedFilesPanel'
import { GenerateMessageModal } from '../components/GenerateMessageModal'
import { ChevronLeftIcon } from '../components/icons'
import { getDocumentFileUrl } from '../lib/documentFile'
import { generateClientMessage } from '../lib/messageTemplate'
import type { Document } from '../types/api'

interface InFlightUpload {
  id: string
  filenames: string[]
  startedAt: number
  error?: string
}

export default function CaseViewPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()

  const { data: theCase, isError: caseNotFound } = useCase(caseId)
  const { data: actTypes } = useActTypes()
  const { data: status } = useCaseStatus(caseId)
  const { data: documents } = useDocuments(caseId)

  const uploadMutation = useUploadDocuments(caseId ?? '')
  const reviewMutation = useReviewDocument(caseId ?? '')
  const classifyMutation = useClassifyDocument(caseId ?? '')
  const overrideMutation = useSetChecklistOverride(caseId ?? '')
  const updateCaseMutation = useUpdateCase(caseId ?? '')
  const validateMutation = useValidateCase(caseId)

  const [inFlight, setInFlight] = useState<InFlightUpload[]>([])
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [messageOpen, setMessageOpen] = useState(false)
  const [draftName, setDraftName] = useState<string | null>(null)

  const actTypeName = useMemo(
    () => actTypes?.find((a) => a.id === theCase?.act_type_id)?.name ?? '',
    [actTypes, theCase],
  )

  // Resolve viewable URLs for documents (thumbnails / "View" links).
  // See src/mocks/documentFile.ts for why this isn't a plain <img src>.
  useEffect(() => {
    if (!documents || !caseId) return
    documents.forEach((doc) => {
      if (fileUrls[doc.id]) return
      getDocumentFileUrl(caseId, doc.id).then((url) => {
        setFileUrls((prev) => (prev[doc.id] ? prev : { ...prev, [doc.id]: url }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, caseId])

  const documentsById = useMemo(() => {
    const map = new Map<string, Document>()
    documents?.forEach((d) => map.set(d.id, d))
    return map
  }, [documents])

  const unrecognizedDocuments = useMemo(
    () => (documents ?? []).filter((d) => d.matched_required_document_type_id === null && d.status !== 'rejected'),
    [documents],
  )

  if (!caseId) return null

  const handleFiles = (files: FileList) => {
    const fileArray = Array.from(files)
    const entryId = crypto.randomUUID()
    setInFlight((prev) => [
      ...prev,
      { id: entryId, filenames: fileArray.map((f) => f.name), startedAt: Date.now() },
    ])
    uploadMutation.mutate(fileArray, {
      onSuccess: () => {
        setInFlight((prev) => prev.filter((e) => e.id !== entryId))
      },
      onError: (err) => {
        setInFlight((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, error: err instanceof Error ? err.message : 'Upload failed' }
              : e,
          ),
        )
      },
    })
  }

  const allReassignOptions: ReassignOption[] =
    status?.checklist.map((i) => ({ id: i.required_document_type_id, name: i.name })) ?? []

  const missingItemNames = (status?.checklist ?? [])
    .filter((i) => i.status === 'missing')
    .map((i) => i.name)

  const missingCount = status?.missing_mandatory.length ?? 0
  const pendingReviewCount = status?.pending_review_count ?? 0

  // Uploads, reviews and overrides are persisted as they happen; the only
  // unsaved input is a client-name edit the user hasn't submitted yet.
  const pendingName = draftName?.trim() ?? ''
  const hasPendingRename = !!theCase && pendingName !== '' && pendingName !== theCase.client_name

  // "Empty" = still the placeholder name, no files, no manual overrides.
  const hasManualOverride = (status?.checklist ?? []).some(
    (i) => i.status === 'not_applicable' || (i.status === 'received' && !i.matched_document_id),
  )
  const caseHasContent =
    hasPendingRename ||
    (!!theCase && theCase.client_name.trim() !== '' && theCase.client_name !== 'New client') ||
    !!theCase?.notes ||
    (documents?.length ?? 0) > 0 ||
    hasManualOverride

  // Explicit save: the back button never saves, so an unsubmitted name edit
  // is discarded unless the user clicks "Save".
  const handleSave = () => {
    const clientName = hasPendingRename ? pendingName : theCase?.client_name
    const leave = () =>
      navigate('/', {
        state: { toast: `Case “${clientName}” was saved as a draft.` } satisfies CaseListLocationState,
      })
    if (!hasPendingRename) {
      leave()
      return
    }
    updateCaseMutation.mutate({ client_name: pendingName }, { onSuccess: leave })
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-16">
      <div className="flex h-[60px] items-center justify-between border-b border-gray-200 bg-white px-6 sm:px-12">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          All cases
        </button>
        {theCase && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!caseHasContent || updateCaseMutation.isPending}
            className="flex min-h-10 items-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateCaseMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {updateCaseMutation.isError && (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 sm:px-12"
        >
          Could not save the changes. Please try again.
        </div>
      )}

      {caseNotFound && (
        <p className="px-6 py-10 text-sm text-red-600 sm:px-12">
          Case not found. It may have been deleted, or the link is wrong.
        </p>
      )}
      {!theCase && !caseNotFound && (
        <p className="px-6 py-10 text-sm text-gray-500 sm:px-12">Loading case...</p>
      )}

      {theCase && (
        <>
          <CaseHeader
            theCase={theCase}
            actTypeName={actTypeName}
            onRename={(name) => updateCaseMutation.mutate({ client_name: name })}
            onDraftChange={setDraftName}
          />

          <div className="flex flex-col gap-5 px-6 sm:px-12">
            {status && (
              <StatusBanner
                overallStatus={status.overall_status}
                missingCount={missingCount}
                pendingReviewCount={pendingReviewCount}
                onGenerateMessage={() => setMessageOpen(true)}
                onMarkSigned={() => {
                  /* Not in the documented contract yet — see final report:
                     there is no "mark case signed" endpoint in ARCHITECTURE.md
                     §3, so this is left as a visible, disabled affordance. */
                }}
                markSignedDisabled
              />
            )}

            <UploadDropzone onFiles={handleFiles} />

            {inFlight.length > 0 && (
              <div className="flex flex-col gap-2">
                {inFlight.map((entry) => (
                  <InFlightUploadRow
                    key={entry.id}
                    filenames={entry.filenames}
                    startedAt={entry.startedAt}
                    error={entry.error}
                    onDismiss={() => setInFlight((prev) => prev.filter((e) => e.id !== entry.id))}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Required documents for {actTypeName.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() => validateMutation.mutate()}
                  disabled={validateMutation.isPending}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
                >
                  Revalidate
                </button>
              </div>

              {status?.checklist.map((item) => {
                const doc = item.matched_document_id
                  ? documentsById.get(item.matched_document_id)
                  : undefined
                return (
                  <ChecklistRow
                    key={item.required_document_type_id}
                    item={item}
                    document={doc}
                    fileUrl={doc ? fileUrls[doc.id] : undefined}
                    reassignOptions={allReassignOptions.filter(
                      (o) => o.id !== item.required_document_type_id,
                    )}
                    busy={reviewMutation.isPending || overrideMutation.isPending}
                    onUploadForRow={handleFiles}
                    onConfirm={(documentId) =>
                      reviewMutation.mutate({ documentId, body: { decision: 'confirm' } })
                    }
                    onReassign={(documentId, requiredDocumentTypeId) =>
                      reviewMutation.mutate({
                        documentId,
                        body: { decision: 'reassign', required_document_type_id: requiredDocumentTypeId },
                      })
                    }
                    onReject={(documentId, note) =>
                      reviewMutation.mutate({ documentId, body: { decision: 'reject', note } })
                    }
                    onMarkReceived={(note) =>
                      overrideMutation.mutate({
                        requiredDocumentTypeId: item.required_document_type_id,
                        body: { override_status: 'received', note: note || undefined },
                      })
                    }
                    onMarkNotApplicable={(note) =>
                      overrideMutation.mutate({
                        requiredDocumentTypeId: item.required_document_type_id,
                        body: { override_status: 'not_applicable', note: note || undefined },
                      })
                    }
                    onBringBack={() =>
                      overrideMutation.mutate({
                        requiredDocumentTypeId: item.required_document_type_id,
                        body: { override_status: 'missing' },
                      })
                    }
                  />
                )
              })}
            </div>

            <UnrecognizedFilesPanel
              documents={unrecognizedDocuments}
              reassignOptions={allReassignOptions}
              fileUrls={fileUrls}
              busy={reviewMutation.isPending}
              onAssign={(documentId, requiredDocumentTypeId) =>
                reviewMutation.mutate({
                  documentId,
                  body: { decision: 'reassign', required_document_type_id: requiredDocumentTypeId },
                })
              }
              onDiscard={(documentId) =>
                reviewMutation.mutate({
                  documentId,
                  body: { decision: 'reject', note: 'Unrecognized document, rejected by assistant' },
                })
              }
              onRetryClassification={(documentId) => classifyMutation.mutate(documentId)}
            />
          </div>
        </>
      )}

      {status && messageOpen && (
        <GenerateMessageModal
          initialText={generateClientMessage(actTypeName, missingItemNames)}
          onClose={() => setMessageOpen(false)}
        />
      )}
    </div>
  )
}
