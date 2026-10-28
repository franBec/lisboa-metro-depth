import { create } from 'zustand'

export interface FocusRequest {
  stationId: string
  nonce: number
}

interface ViewerState {
  labelsVisible: boolean
  inferredVisible: boolean
  verticalScale: number
  sceneReady: boolean
  focusRequest: FocusRequest | null
  setLabelsVisible: (visible: boolean) => void
  setInferredVisible: (visible: boolean) => void
  setVerticalScale: (scale: number) => void
  setSceneReady: (ready: boolean) => void
  requestFocus: (stationId: string) => void
  clearFocusRequest: (nonce: number) => void
}

let focusNonce = 0

export const useViewerStore = create<ViewerState>((set) => ({
  labelsVisible: true,
  inferredVisible: true,
  verticalScale: 10,
  sceneReady: false,
  focusRequest: null,
  setLabelsVisible: (visible) => set({ labelsVisible: visible }),
  setInferredVisible: (visible) => set({ inferredVisible: visible }),
  setVerticalScale: (scale) => set({ verticalScale: scale }),
  setSceneReady: (ready) => set({ sceneReady: ready }),
  requestFocus: (stationId) =>
    set({ focusRequest: { stationId, nonce: (focusNonce += 1) } }),
  clearFocusRequest: (nonce) =>
    set((state) => {
      if (state.focusRequest?.nonce !== nonce) {
        return {}
      }
      return { focusRequest: null }
    }),
}))
