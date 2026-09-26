import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from './client'
import type { Case, CaseStatusResponse, CreateCaseRequest, UpdateCaseRequest } from '../types/api'

/** Placeholder client name stored on new cases. It is persisted data (and
 * compared against to detect an untouched case), so it is not localized —
 * the UI shows `common.newClient` instead when a name is empty. */
export const DEFAULT_CLIENT_NAME = 'New client'

export function useCases(status?: Case['status']) {
  return useQuery({
    queryKey: ['cases', { status }],
    queryFn: () =>
      apiGet<{ items: Case[] }>(`/cases${status ? `?status=${status}` : ''}`),
    select: (data) => {
      return data.items
    }
  })
}

export function useCase(caseId: string | undefined) {
  return useQuery({
    queryKey: ['cases', caseId],
    queryFn: () => apiGet<Case>(`/cases/${caseId}`),
    enabled: !!caseId,
  })
}

export function useCaseStatus(caseId: string | undefined) {
  return useQuery({
    queryKey: ['cases', caseId, 'status'],
    queryFn: () => apiGet<CaseStatusResponse>(`/cases/${caseId}/status`),
    enabled: !!caseId,
  })
}

export function useCreateCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCaseRequest) => apiPost<Case>('/cases', body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.setQueryData(['cases', created.id], created)
    },
  })
}

/** See UpdateCaseRequest doc comment: PATCH /cases/{id} is an additive
 * assumption, not part of the documented §3.2 contract. */
export function useUpdateCase(caseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateCaseRequest) => apiPatch<Case>(`/cases/${caseId}`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['cases', caseId], updated)
      // Refresh the case list too, so a rename shows up there immediately.
      queryClient.invalidateQueries({ queryKey: ['cases'], refetchType: 'none' })
    },
  })
}

export function useValidateCase(caseId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<CaseStatusResponse>(`/cases/${caseId}/validate`),
    onSuccess: (status) => {
      queryClient.setQueryData(['cases', caseId, 'status'], status)
      queryClient.invalidateQueries({ queryKey: ['cases', caseId] })
    },
  })
}
