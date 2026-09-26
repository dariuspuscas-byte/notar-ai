/**
 * In-memory mock backend, standing in for `backend/core` + `backend/api`
 * until the real service exists. Implements the derivation rules in
 * /specs/ARCHITECTURE.md §2.7 and the confidence policy in §4.4 closely
 * enough to demo the full frontend flow and exercise every UI state.
 *
 * This is intentionally NOT meant to be production logic — it's a fixture
 * generator, reset on every page load (no persistence).
 */
import { MOCK_CONFIDENCE_THRESHOLD, SEED_ACT_TYPES } from './seed'
import type {
  ActType,
  Case,
  ClassificationDecision,
  ClassificationResult,
  Document,
  DocumentStatus,
  OverallStatus,
  OverrideStatus,
  RequiredDocumentType,
} from '../types/api'

function uuid(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

interface DbActType extends ActType {
  requiredDocumentTypes: RequiredDocumentType[]
}

interface DbOverride {
  id: string
  case_id: string
  required_document_type_id: string
  override_status: OverrideStatus
  note: string | null
  set_by: string | null
  set_at: string
}

const actTypes: DbActType[] = SEED_ACT_TYPES.map((seed) => {
  const actTypeId = uuid()
  return {
    id: actTypeId,
    code: seed.code,
    name: seed.name,
    status: 'draft',
    requiredDocumentTypes: seed.requiredDocumentTypes.map((rdt) => ({
      id: uuid(),
      code: rdt.code,
      name: rdt.name,
      description: rdt.description,
      is_mandatory: rdt.is_mandatory,
      allow_multiple: rdt.allow_multiple,
      sort_order: rdt.sort_order,
    })),
  }
})

// keep hints reachable by required_document_type id, for the mock classifier
const hintsByRequiredDocTypeId = new Map<string, string[]>()
SEED_ACT_TYPES.forEach((seed, actIdx) => {
  seed.requiredDocumentTypes.forEach((rdt, rdtIdx) => {
    hintsByRequiredDocTypeId.set(actTypes[actIdx].requiredDocumentTypes[rdtIdx].id, rdt.hints)
  })
})

const cases: Case[] = []
const documents: Document[] = []
const classificationResults: ClassificationResult[] = []
const overrides: DbOverride[] = []

export const notFound = (message: string) => new Error(`NOT_FOUND:${message}`)

export function listActTypes(): ActType[] {
  return actTypes.map(({ id, code, name, status }) => ({ id, code, name, status }))
}

export function getActType(actTypeId: string): DbActType | undefined {
  return actTypes.find((a) => a.id === actTypeId)
}

export function getChecklistTemplate(actTypeId: string): RequiredDocumentType[] | undefined {
  return getActType(actTypeId)?.requiredDocumentTypes
}

export function createCase(input: {
  act_type_id: string
  client_name: string
  notes?: string
  created_by?: string
}): Case {
  const created: Case = {
    id: uuid(),
    act_type_id: input.act_type_id,
    client_name: input.client_name,
    notes: input.notes ?? null,
    status: 'missing_documents',
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by: input.created_by ?? null,
  }
  cases.push(created)
  return created
}

export function getCase(caseId: string): Case | undefined {
  return cases.find((c) => c.id === caseId)
}

/** Mock-only support for the assumed PATCH /cases/{id} — see UpdateCaseRequest. */
export function updateCase(
  caseId: string,
  patch: { client_name?: string; notes?: string },
): Case {
  const found = getCase(caseId)
  if (!found) throw notFound('case_not_found')
  if (patch.client_name !== undefined) found.client_name = patch.client_name
  if (patch.notes !== undefined) found.notes = patch.notes
  found.updated_at = nowIso()
  return found
}

export function listCases(status?: OverallStatus): Case[] {
  const sorted = [...cases].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return status ? sorted.filter((c) => c.status === status) : sorted
}

export function listDocuments(caseId: string): Document[] {
  return documents
    .filter((d) => d.case_id === caseId)
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
}

export function getDocument(caseId: string, documentId: string): Document | undefined {
  return documents.find((d) => d.case_id === caseId && d.id === documentId)
}

function latestClassificationFor(documentId: string): ClassificationResult | undefined {
  const rows = classificationResults.filter((r) => (r as any)._document_id === documentId)
  return rows[rows.length - 1]
}

function attachLatestResult(doc: Document): Document {
  const result = latestClassificationFor(doc.id)
  return { ...doc, latest_classification_result: result ?? null }
}

// ---- mock "AI" classification -------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function scoreFilenameAgainstHints(filename: string, hints: string[]): number {
  const name = normalize(filename)
  let best = 0
  for (const hint of hints) {
    const h = normalize(hint)
    if (name.includes(h.replace(/\s+/g, ''))) best = Math.max(best, 0.95)
    else if (h.split(' ').some((word) => word.length > 2 && name.includes(word))) {
      best = Math.max(best, 0.65)
    }
  }
  return best
}

/**
 * Simulates one Ollama vision classification call (§4.3/§4.4) for a single
 * uploaded file against the case's act-type checklist.
 */
function mockClassify(
  actType: DbActType,
  filename: string,
): {
  predicted_required_document_type_id: string | null
  predicted_type_code_raw: string
  confidence: number
  reasoning: string
} {
  let bestType: RequiredDocumentType | null = null
  let bestScore = 0
  for (const rdt of actType.requiredDocumentTypes) {
    const hints = hintsByRequiredDocTypeId.get(rdt.id) ?? []
    const score = scoreFilenameAgainstHints(filename, hints)
    if (score > bestScore) {
      bestScore = score
      bestType = rdt
    }
  }

  if (bestType && bestScore >= 0.9) {
    return {
      predicted_required_document_type_id: bestType.id,
      predicted_type_code_raw: bestType.code,
      confidence: 0.9 + Math.random() * 0.09,
      reasoning: `The filename and content appear to match "${bestType.name}".`,
    }
  }
  if (bestType && bestScore >= 0.5) {
    return {
      predicted_required_document_type_id: bestType.id,
      predicted_type_code_raw: bestType.code,
      confidence: 0.5 + Math.random() * 0.3,
      reasoning: `The document looks partly similar to "${bestType.name}", but image quality or missing key elements reduce certainty.`,
    }
  }
  // no filename signal at all — either guess a random known type at low
  // confidence, or return a genuinely unmapped ("unknown") result.
  if (Math.random() < 0.25 || actType.requiredDocumentTypes.length === 0) {
    return {
      predicted_required_document_type_id: null,
      predicted_type_code_raw: 'unknown',
      confidence: 0.2 + Math.random() * 0.2,
      reasoning:
        'The document does not match any type in the current act list — manual review needed.',
    }
  }
  const fallback =
    actType.requiredDocumentTypes[Math.floor(Math.random() * actType.requiredDocumentTypes.length)]
  return {
    predicted_required_document_type_id: fallback.id,
    predicted_type_code_raw: fallback.code,
    confidence: 0.35 + Math.random() * 0.3,
    reasoning: `The most likely match is "${fallback.name}", but confidence is low.`,
  }
}

function applyPolicy(confidence: number): ClassificationDecision {
  if (confidence >= MOCK_CONFIDENCE_THRESHOLD) return 'auto_accepted'
  return 'needs_review'
}

export function uploadAndClassify(caseId: string, files: File[]): Document[] {
  const theCase = getCase(caseId)
  if (!theCase) throw notFound('case_not_found')
  const actType = getActType(theCase.act_type_id)
  if (!actType) throw notFound('act_type_not_found')

  const created: Document[] = []
  for (const file of files) {
    const prediction = mockClassify(actType, file.name)
    const decision: ClassificationDecision =
      prediction.predicted_required_document_type_id === null
        ? 'rejected_unknown'
        : applyPolicy(prediction.confidence)

    const status: DocumentStatus = decision === 'auto_accepted' ? 'classified_auto' : 'needs_review'

    const doc: Document = {
      id: uuid(),
      case_id: caseId,
      original_filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size_bytes: file.size,
      status,
      matched_required_document_type_id: prediction.predicted_required_document_type_id,
      uploaded_at: nowIso(),
      uploaded_by: null,
      // mock-only convenience so <img> previews work without a storage layer
      // (real backend would return a storage path / file URL instead)
      // @ts-expect-error mock-only field, not part of the documented contract
      _objectUrl: URL.createObjectURL(file),
    }
    documents.push(doc)

    const result: ClassificationResult = {
      id: uuid(),
      predicted_required_document_type_id: prediction.predicted_required_document_type_id,
      predicted_type_code_raw: prediction.predicted_type_code_raw,
      confidence: Math.round(prediction.confidence * 100) / 100,
      alternative_type_code_raw: null,
      reasoning: prediction.reasoning,
      decision,
      model_used: 'llama3.2-vision:11b (mock)',
      created_at: nowIso(),
    }
    ;(result as any)._document_id = doc.id
    classificationResults.push(result)

    created.push(attachLatestResult(doc))
  }
  touchCase(caseId)
  return created
}

export function reviewDocument(
  caseId: string,
  documentId: string,
  input:
    | { decision: 'confirm' }
    | { decision: 'reassign'; required_document_type_id: string }
    | { decision: 'reject'; note: string },
): Document {
  const doc = getDocument(caseId, documentId)
  if (!doc) throw notFound('document_not_found')

  if (input.decision === 'confirm') {
    doc.status = 'confirmed'
  } else if (input.decision === 'reassign') {
    doc.status = 'confirmed'
    doc.matched_required_document_type_id = input.required_document_type_id
  } else {
    doc.status = 'rejected'
  }
  touchCase(caseId)
  return attachLatestResult(doc)
}

export function setOverride(
  caseId: string,
  requiredDocumentTypeId: string,
  input: { override_status: OverrideStatus; note?: string; set_by?: string },
): DbOverride {
  const row: DbOverride = {
    id: uuid(),
    case_id: caseId,
    required_document_type_id: requiredDocumentTypeId,
    override_status: input.override_status,
    note: input.note ?? null,
    set_by: input.set_by ?? null,
    set_at: nowIso(),
  }
  overrides.push(row)
  touchCase(caseId)
  return row
}

function effectiveOverride(caseId: string, requiredDocumentTypeId: string): DbOverride | undefined {
  const rows = overrides.filter(
    (o) => o.case_id === caseId && o.required_document_type_id === requiredDocumentTypeId,
  )
  return rows[rows.length - 1]
}

/** Implements the §2.7 per-item + case-level derivation. */
export function computeStatus(caseId: string): {
  overall_status: OverallStatus
  checklist: {
    required_document_type_id: string
    code: string
    name: string
    is_mandatory: boolean
    status: 'received' | 'missing' | 'not_applicable' | 'pending_review'
    matched_document_id: string | null
    confidence: number | null
  }[]
  missing_mandatory: string[]
  pending_review_count: number
} {
  const theCase = getCase(caseId)
  if (!theCase) throw notFound('case_not_found')
  const actType = getActType(theCase.act_type_id)
  if (!actType) throw notFound('act_type_not_found')
  const caseDocuments = listDocuments(caseId)

  const checklist = actType.requiredDocumentTypes
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((rdt) => {
      const override = effectiveOverride(caseId, rdt.id)
      if (override) {
        return {
          required_document_type_id: rdt.id,
          code: rdt.code,
          name: rdt.name,
          is_mandatory: rdt.is_mandatory,
          status: override.override_status,
          matched_document_id: null,
          confidence: null,
        }
      }

      const receivedDoc = caseDocuments.find(
        (d) =>
          d.matched_required_document_type_id === rdt.id &&
          (d.status === 'classified_auto' || d.status === 'confirmed'),
      )
      if (receivedDoc) {
        const result = latestClassificationFor(receivedDoc.id)
        return {
          required_document_type_id: rdt.id,
          code: rdt.code,
          name: rdt.name,
          is_mandatory: rdt.is_mandatory,
          status: 'received' as const,
          matched_document_id: receivedDoc.id,
          confidence: result?.confidence ?? null,
        }
      }

      const pendingDoc = caseDocuments.find(
        (d) => d.matched_required_document_type_id === rdt.id && d.status === 'needs_review',
      )
      if (pendingDoc) {
        const result = latestClassificationFor(pendingDoc.id)
        return {
          required_document_type_id: rdt.id,
          code: rdt.code,
          name: rdt.name,
          is_mandatory: rdt.is_mandatory,
          status: 'pending_review' as const,
          matched_document_id: pendingDoc.id,
          confidence: result?.confidence ?? null,
        }
      }

      return {
        required_document_type_id: rdt.id,
        code: rdt.code,
        name: rdt.name,
        is_mandatory: rdt.is_mandatory,
        status: 'missing' as const,
        matched_document_id: null,
        confidence: null,
      }
    })

  const missingMandatory = checklist.filter((i) => i.is_mandatory && i.status === 'missing')
  const pendingReviewMandatory = checklist.filter(
    (i) => i.is_mandatory && i.status === 'pending_review',
  )

  let overall_status: OverallStatus
  if (missingMandatory.length === 0 && pendingReviewMandatory.length === 0) {
    overall_status = 'ready_to_sign'
  } else if (missingMandatory.length > 0) {
    overall_status = 'missing_documents'
  } else {
    overall_status = 'pending_review'
  }

  // keep the cached `cases.status` in sync, mirroring §2.7's storage note
  theCase.status = overall_status
  theCase.updated_at = nowIso()

  return {
    overall_status,
    checklist,
    missing_mandatory: missingMandatory.map((i) => i.code),
    pending_review_count: checklist.filter((i) => i.status === 'pending_review').length,
  }
}

function touchCase(caseId: string) {
  // recompute so `cases.status` never drifts from the derivation, per §2.7
  try {
    computeStatus(caseId)
  } catch {
    // case not found — nothing to touch
  }
}

/** Documents that came back from classification matching nothing at all
 * in this act type's checklist (§4.5 / UX spec §7 "Unrecognized files"). */
export function listUnrecognizedDocuments(caseId: string): Document[] {
  return listDocuments(caseId)
    .filter((d) => d.matched_required_document_type_id === null && d.status !== 'rejected')
    .map(attachLatestResult)
}

export function getDocumentObjectUrl(documentId: string): string | undefined {
  const doc = documents.find((d) => d.id === documentId)
  return doc ? (doc as any)._objectUrl : undefined
}

export function listDocumentsWithResults(caseId: string): Document[] {
  return listDocuments(caseId).map(attachLatestResult)
}
