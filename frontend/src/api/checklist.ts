import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost } from './client'
import type { OverrideRequest, OverrideResponse } from '../types/api'

export function useSetChecklistOverride(caseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      requiredDocumentTypeId,
      body,
    }: {
      requiredDocumentTypeId: string
      body: OverrideRequest
    }) =>
      apiPost<OverrideResponse>(
        `/cases/${caseId}/checklist/${requiredDocumentTypeId}/override`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'status'] })
      queryClient.invalidateQueries({ queryKey: ['cases', caseId] })
    },
  })
}
