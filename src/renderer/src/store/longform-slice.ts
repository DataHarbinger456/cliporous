import type { StateCreator } from 'zustand'
import type { AppState, LongformSkinId } from './types'
import type { LongformEditPlan } from '@shared/types'

// ---------------------------------------------------------------------------
// Longform Slice
//
// Persists the expensive Gemini-generated long-form edit plan (plus the skin /
// palette the plan was rendered with) keyed by source ID. This lets a saved or
// crash-recovered long-form project re-render WITHOUT paying for the Gemini
// call again. Short-form clips live in the clips slice; this is the long-form
// (16:9) equivalent "persistence floor".
// ---------------------------------------------------------------------------

/** A persisted long-form edit plan along with the render axes it was made for. */
export interface LongformPlanRecord {
  plan: LongformEditPlan
  /** Visual block skin the plan was generated/rendered with. */
  skin: LongformSkinId
  /** Palette ID the plan was generated/rendered with. */
  paletteId: string
}

export interface LongformSlice {
  /** Long-form edit plans keyed by source ID. */
  longformPlans: Record<string, LongformPlanRecord>

  setLongformPlan: (sourceId: string, record: LongformPlanRecord) => void
  clearLongformPlan: (sourceId: string) => void
  getLongformPlan: (sourceId: string) => LongformPlanRecord | null
}

export const createLongformSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  LongformSlice
> = (set, get) => ({
  longformPlans: {},

  setLongformPlan: (sourceId, record) =>
    set((state) => {
      state.longformPlans[sourceId] = record
    }),

  clearLongformPlan: (sourceId) =>
    set((state) => {
      delete state.longformPlans[sourceId]
    }),

  getLongformPlan: (sourceId) => get().longformPlans[sourceId] ?? null,
})
