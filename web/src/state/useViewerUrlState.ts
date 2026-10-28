import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

export function parseSelectedLines(
  raw: string | null,
  validLineIds: Iterable<string>,
): Set<string> {
  if (!raw) {
    return new Set()
  }

  const valid = new Set(validLineIds)
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => valid.has(value)),
  )
}

export function useViewerUrlState(lineIds: string[]) {
  const [searchParams, setSearchParams] = useSearchParams()
  const validLineIds = useMemo(() => new Set(lineIds), [lineIds])
  const lineParam = searchParams.get('line')
  const selectedStationId = searchParams.get('station')
  const xray = searchParams.get('xray') === '1'

  const selectedLines = useMemo(
    () => parseSelectedLines(lineParam, validLineIds),
    [lineParam, validLineIds],
  )

  const update = useCallback(
    (
      mutate: (params: URLSearchParams) => void,
      replace: boolean,
    ): void => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          mutate(next)
          return next
        },
        { replace },
      )
    },
    [setSearchParams],
  )

  const toggleLine = useCallback(
    (lineId: string): void => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          const selected = parseSelectedLines(
            previous.get('line'),
            validLineIds,
          )

          if (selected.has(lineId)) {
            selected.delete(lineId)
          } else {
            selected.add(lineId)
          }

          if (selected.size) {
            next.set('line', [...selected].sort().join(','))
          } else {
            next.delete('line')
          }
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams, validLineIds],
  )

  const selectStation = useCallback(
    (stationId: string): void => {
      update((params) => params.set('station', stationId), true)
    },
    [update],
  )

  const clearStation = useCallback((): void => {
    update((params) => params.delete('station'), true)
  }, [update])

  const setXray = useCallback(
    (enabled: boolean): void => {
      update((params) => {
        if (enabled) {
          params.set('xray', '1')
        } else {
          params.delete('xray')
        }
      }, true)
    },
    [update],
  )

  return {
    selectedLines,
    selectedStationId,
    xray,
    toggleLine,
    selectStation,
    clearStation,
    setXray,
  }
}
