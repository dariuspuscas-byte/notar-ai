import { API_BASE_URL } from '../api/client'

const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS !== 'false'

/**
 * Returns a viewable URL for a document's underlying file.
 *
 * Real backend: GET /cases/{caseId}/documents/{documentId}/file (ARCHITECTURE.md
 * §3.3). In mock mode we resolve straight to the in-memory object URL created
 * at upload time.
 */
export async function getDocumentFileUrl(caseId: string, documentId: string): Promise<string> {
  if (MOCKS_ENABLED) {
    const { getDocumentObjectUrl } = await import('../mocks/db')
    const url = getDocumentObjectUrl(documentId)
    if (url) return url
  }
  return `${API_BASE_URL}/cases/${caseId}/documents/${documentId}/file`
}
