import { queryOptions, useQuery } from '@tanstack/react-query'
import { loadViewerData } from './client'

export const viewerDataQuery = queryOptions({
  queryKey: ['viewer-data'],
  queryFn: loadViewerData,
  staleTime: Infinity,
  retry: false,
})

export function useViewerData() {
  return useQuery(viewerDataQuery)
}
