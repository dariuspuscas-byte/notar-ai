import { HttpResponse, delay, http } from 'msw'
import { API_BASE_URL } from '../api/client'
import * as db from './db'

const base = API_BASE_URL

function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

export const handlers = [
  // §3.1 --------------------------------------------------------------
  http.get(`${base}/act-types`, async () => {
    await delay(150)
    return HttpResponse.json({ items: db.listActTypes() })
  }),

  http.get(`${base}/act-types/:actTypeId/checklist`, async ({ params }) => {
    await delay(150)
    const items = db.getChecklistTemplate(String(params.actTypeId))
    if (!items) return errorResponse(404, 'act_type_not_found', 'Unknown act type')
    return HttpResponse.json({ items })
  }),

  // §3.2 --------------------------------------------------------------
  http.post(`${base}/cases`, async ({ request }) => {
    await delay(200)
    const body = (await request.json()) as {
      act_type_id: string
      client_name: string
      notes?: string
      created_by?: string
    }
    if (!db.getActType(body.act_type_id)) {
      return errorResponse(400, 'act_type_not_found', 'Unknown act_type_id')
    }
    const created = db.createCase(body)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${base}/cases/:caseId`, async ({ params }) => {
    await delay(120)
    const found = db.getCase(String(params.caseId))
    if (!found) return errorResponse(404, 'case_not_found', 'Case not found')
    return HttpResponse.json(found)
  }),

  // Not in the documented §3.2 contract — additive assumption, see
  // UpdateCaseRequest's doc comment in src/types/api.ts.
  http.patch(`${base}/cases/:caseId`, async ({ params, request }) => {
    const caseId = String(params.caseId)
    if (!db.getCase(caseId)) return errorResponse(404, 'case_not_found', 'Case not found')
    const body = (await request.json()) as { client_name?: string; notes?: string }
    await delay(120)
    return HttpResponse.json(db.updateCase(caseId, body))
  }),

  http.get(`${base}/cases`, async ({ request }) => {
    await delay(150)
    const status = new URL(request.url).searchParams.get('status') as
      | 'ready_to_sign'
      | 'missing_documents'
      | 'pending_review'
      | null
    return HttpResponse.json({ items: db.listCases(status ?? undefined) })
  }),

  // §3.3 --------------------------------------------------------------
  http.post(`${base}/cases/:caseId/documents`, async ({ params, request }) => {
    const caseId = String(params.caseId)
    if (!db.getCase(caseId)) return errorResponse(404, 'case_not_found', 'Case not found')
    const formData = await request.formData()
    const files = formData.getAll('files[]').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return errorResponse(400, 'no_files', 'No files were attached to the upload')
    }
    // simulate local-LLM inference latency, one call per file (§4.1/§4.6)
    await delay(600 * files.length + Math.random() * 800)
    const created = db.uploadAndClassify(caseId, files)
    return HttpResponse.json({ items: created }, { status: 201 })
  }),

  http.get(`${base}/cases/:caseId/documents`, async ({ params }) => {
    await delay(120)
    const caseId = String(params.caseId)
    if (!db.getCase(caseId)) return errorResponse(404, 'case_not_found', 'Case not found')
    return HttpResponse.json({ items: db.listDocumentsWithResults(caseId) })
  }),

  // §3.4 --------------------------------------------------------------
  http.post(`${base}/cases/:caseId/documents/:documentId/classify`, async ({ params }) => {
    const caseId = String(params.caseId)
    const documentId = String(params.documentId)
    const doc = db.getDocument(caseId, documentId)
    if (!doc) return errorResponse(404, 'document_not_found', 'Document not found')
    await delay(1200)
    // Re-run the mock classifier as a "retry" — reuses the upload pipeline's
    // policy by re-uploading against the same filename is overkill here;
    // for the mock, just report the already-computed latest result.
    const refreshed = db.listDocumentsWithResults(caseId).find((d) => d.id === documentId)!
    return HttpResponse.json({
      document: refreshed,
      classification_result: refreshed.latest_classification_result,
    })
  }),

  http.post(`${base}/cases/:caseId/documents/:documentId/review`, async ({ params, request }) => {
    const caseId = String(params.caseId)
    const documentId = String(params.documentId)
    if (!db.getDocument(caseId, documentId)) {
      return errorResponse(404, 'document_not_found', 'Document not found')
    }
    const body = (await request.json()) as
      | { decision: 'confirm' }
      | { decision: 'reassign'; required_document_type_id: string }
      | { decision: 'reject'; note: string }
    await delay(150)
    const updated = db.reviewDocument(caseId, documentId, body)
    return HttpResponse.json(updated)
  }),

  // §3.5 --------------------------------------------------------------
  http.post(
    `${base}/cases/:caseId/checklist/:requiredDocumentTypeId/override`,
    async ({ params, request }) => {
      const caseId = String(params.caseId)
      if (!db.getCase(caseId)) return errorResponse(404, 'case_not_found', 'Case not found')
      const body = (await request.json()) as {
        override_status: 'received' | 'missing' | 'not_applicable'
        note?: string
        set_by?: string
      }
      await delay(150)
      const result = db.setOverride(caseId, String(params.requiredDocumentTypeId), body)
      return HttpResponse.json(result)
    },
  ),

  // §3.6 --------------------------------------------------------------
  http.post(`${base}/cases/:caseId/validate`, async ({ params }) => {
    const caseId = String(params.caseId)
    if (!db.getCase(caseId)) return errorResponse(404, 'case_not_found', 'Case not found')
    await delay(200)
    const status = db.computeStatus(caseId)
    return HttpResponse.json({ case_id: caseId, ...status })
  }),

  // §3.7 --------------------------------------------------------------
  http.get(`${base}/cases/:caseId/status`, async ({ params }) => {
    const caseId = String(params.caseId)
    if (!db.getCase(caseId)) return errorResponse(404, 'case_not_found', 'Case not found')
    await delay(120)
    const status = db.computeStatus(caseId)
    return HttpResponse.json({ case_id: caseId, ...status })
  }),
]
