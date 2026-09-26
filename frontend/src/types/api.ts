/**
 * Types mirroring the REST contract in /specs/ARCHITECTURE.md §2 and §3.
 *
 * These are meant to match the documented response shapes field-for-field.
 * Where the frontend needs data the documented contract doesn't expose yet,
 * the extra field is marked "ASSUMPTION" below and called out in the final
 * report — it is additive only, never a rename/removal of a documented field.
 */

// ---- §2.1 / §3.1 act types ---------------------------------------------

export type ActTypeStatus = 'draft' | 'in_progress' | 'ready' | 'completed'

export interface ActType {
  id: string
  code: string
  name: string
  status: ActTypeStatus
}

// ---- §2.2 / §3.1 required document types (checklist template) ---------

export interface RequiredDocumentType {
  id: string
  code: string
  name: string
  description: string | null
  is_mandatory: boolean
  allow_multiple: boolean
  sort_order: number
}

// ---- §2.3 / §3.2 cases --------------------------------------------------

export type OverallStatus = 'ready_to_sign' | 'missing_documents' | 'pending_review'

export interface Case {
  id: string
  act_type_id: string
  client_name: string
  notes: string | null
  status: OverallStatus
  created_at: string
  updated_at: string
  created_by?: string | null
}

export interface CreateCaseRequest {
  act_type_id: string
  client_name: string
  notes?: string
  created_by?: string
}

/**
 * ASSUMPTION (flagged in final report): §3.2 documents only POST /cases and
 * GET /cases[/{id}] — there is no documented update endpoint, yet the UX
 * spec (§1.2) expects a case to start as "New client" and be renamed later
 * from the Case View header, and (§1.3) an "Edit act type" affordance.
 * We add PATCH /cases/{id} for client_name/notes only (additive, not renaming
 * or removing anything documented) to support that. We do NOT implement
 * changing act_type_id: §2.3 explicitly states it is "set at creation,
 * immutable" and no endpoint recomputes/merges a checklist across an act-type
 * change, so the UX spec's "Edit act type" affordance is left
 * unimplemented pending a contract decision — see final report.
 */
export interface UpdateCaseRequest {
  client_name?: string
  notes?: string
}

// ---- §2.4 / §3.3 documents ----------------------------------------------

export type DocumentStatus =
  | 'pending_classification'
  | 'classified_auto'
  | 'needs_review'
  | 'confirmed'
  | 'rejected'

export interface Document {
  id: string
  case_id: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  status: DocumentStatus
  matched_required_document_type_id: string | null
  uploaded_at: string
  uploaded_by?: string | null
  /** Present only on an upload response item when classification errored. */
  classification_error?: string | null
  /**
   * ASSUMPTION (flagged in final report): §3.3's documented upload response
   * only lists the fields above, but Phase 2 needs predicted type + confidence
   * + reasoning right after upload and again later in the review UI, and no
   * documented endpoint returns classification_results after the fact except
   * the synchronous POST .../classify response. We additively assume the
   * backend will also embed the *latest* classification_results row here
   * under this field on Document responses (GET .../documents and upload
   * response items) — same shape as ClassificationResult below. Nothing
   * documented is renamed or removed; if the backend doesn't add this,
   * the frontend degrades to showing only status + the checklist-level
   * `confidence` from GET /status (see CaseStatusChecklistItem).
   */
  latest_classification_result?: ClassificationResult | null
}

// ---- §2.5 / §3.4 classification results ---------------------------------

export type ClassificationDecision = 'auto_accepted' | 'needs_review' | 'rejected_unknown'

export interface ClassificationResult {
  id: string
  predicted_required_document_type_id: string | null
  predicted_type_code_raw: string
  confidence: number
  alternative_type_code_raw: string | null
  reasoning: string
  decision: ClassificationDecision
  model_used: string
  created_at: string
}

export interface ClassifyResponse {
  document: Document
  classification_result: ClassificationResult
}

// ---- §3.4 review ----------------------------------------------------------

export type ReviewDecision = 'confirm' | 'reassign' | 'reject'

export type ReviewRequest =
  | { decision: 'confirm' }
  | { decision: 'reassign'; required_document_type_id: string }
  | { decision: 'reject'; note: string }

// ---- §2.6 / §3.5 checklist overrides --------------------------------------

export type OverrideStatus = 'received' | 'missing' | 'not_applicable'

export interface OverrideRequest {
  override_status: OverrideStatus
  note?: string
  set_by?: string
}

export interface OverrideResponse {
  required_document_type_id: string
  override_status: OverrideStatus
  note?: string | null
  set_by?: string | null
  set_at?: string
}

// ---- §2.7 / §3.7 case status ------------------------------------------------

export type ChecklistItemStatus = 'received' | 'missing' | 'not_applicable' | 'pending_review'

export interface CaseStatusChecklistItem {
  required_document_type_id: string
  code: string
  name: string
  is_mandatory: boolean
  status: ChecklistItemStatus
  matched_document_id: string | null
  confidence: number | null
}

export interface CaseStatusResponse {
  case_id: string
  overall_status: OverallStatus
  checklist: CaseStatusChecklistItem[]
  missing_mandatory: string[]
  pending_review_count: number
}

// ---- §3.8 error shape -------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
