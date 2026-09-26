import { API_BASE_URL } from '../api/client'

const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS !== 'false'

/**
 * Returns a viewable URL for a document's underlying file.
 *
 * GAP IN THE DOCUMENTED CONTRACT (flagged in the final report): ARCHITECTURE.md
 * §3 never defines a "fetch/view the uploaded file" endpoint, even though the
 * UX spec requires a "View" link and a thumbnail preview in the
 * review UI. In mock mode we resolve straight to the in-memory object URL
 * created at upload time. In real-backend mode we fall back to a conventional
 * guess — confirm/adjust with the backend once this endpoint is specced.
 */
export async function getDocumentFileUrl(caseId: string, documentId: string): Promise<string> {
  if (MOCKS_ENABLED) {
    const { getDocumentObjectUrl } = await import('../mocks/db')
    const url = getDocumentObjectUrl(documentId)
    if (url) return url
  }
  return `${API_BASE_URL}/cases/${caseId}/documents/${documentId}/file`
}
