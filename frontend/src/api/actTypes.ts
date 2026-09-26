import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { ActType, RequiredDocumentType } from '../types/api'

export function useActTypes() {
  return useQuery({
    queryKey: ['act-types'],
    queryFn: () => apiGet<{ items: ActType[] }>('/act-types'),
    select: (data) => data.items,
  })
}

export function useChecklist(actTypeId: string | undefined) {
  return useQuery({
    queryKey: ['act-types', actTypeId, 'checklist'],
    queryFn: () => apiGet<{ items: RequiredDocumentType[] }>(`/act-types/${actTypeId}/checklist`),
    select: (data) => data.items,
    enabled: !!actTypeId,
  })
}
