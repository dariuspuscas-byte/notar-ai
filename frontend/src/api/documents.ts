import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiUpload } from './client'
import type { ClassifyResponse, Document, ReviewRequest } from '../types/api'

export function useDocuments(caseId: string | undefined) {
  return useQuery({
    queryKey: ['cases', caseId, 'documents'],
    queryFn: () => apiGet<{ items: Document[] }>(`/cases/${caseId}/documents`),
    select: (data) => data.items,
    enabled: !!caseId,
  })
}

function invalidateCase(queryClient: ReturnType<typeof useQueryClient>, caseId: string) {
  queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'documents'] })
  queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'status'] })
  queryClient.invalidateQueries({ queryKey: ['cases', caseId] })
}

export function useUploadDocuments(caseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData()
      for (const file of files) formData.append('files[]', file)
      return apiUpload<{ items: Document[] }>(`/cases/${caseId}/documents`, formData)
    },
    onSuccess: () => invalidateCase(queryClient, caseId),
  })
}

export function useClassifyDocument(caseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      apiPost<ClassifyResponse>(`/cases/${caseId}/documents/${documentId}/classify`),
    onSuccess: () => invalidateCase(queryClient, caseId),
  })
}

export function useReviewDocument(caseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, body }: { documentId: string; body: ReviewRequest }) =>
      apiPost<Document>(`/cases/${caseId}/documents/${documentId}/review`, body),
    onSuccess: () => invalidateCase(queryClient, caseId),
  })
}
