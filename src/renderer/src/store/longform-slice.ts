import type { LongformEditPlan, LongformRenderReconciliation } from '@shared/types';
import type { StateCreator } from 'zustand';
import type { PreservedLongformItem } from '@/lib/longform-plan';
import type { AppState, LongformSkinId } from './types';

export type LongformPlanVersionOrigin = 'generated' | 'user-edited' | 'regenerated' | 'accepted';
export type LongformPlanStatus = 'draft' | 'accepted' | 'rejected';

export interface LongformPlanVersion {
  id: string;
  plan: LongformEditPlan;
  origin: LongformPlanVersionOrigin;
  createdAt: number;
  note?: string;
}

export interface LongformPlanFeedback {
  id: string;
  targetKey: string | null;
  targetLabel: string;
  message: string;
  createdAt: number;
  status: 'pending' | 'applied';
}

/** A persisted long-form edit plan, its review history, and render proof. */
export interface LongformPlanRecord {
  /** Active plan mirror kept for backward compatibility with saved projects. */
  plan: LongformEditPlan;
  skin: LongformSkinId;
  paletteId: string;
  versions?: LongformPlanVersion[];
  activeVersionId?: string;
  approvedVersionId?: string | null;
  status?: LongformPlanStatus;
  feedback?: LongformPlanFeedback[];
  preservedItems?: PreservedLongformItem[];
  reconciliation?: LongformRenderReconciliation | null;
}

export interface LongformSlice {
  longformPlans: Record<string, LongformPlanRecord>;
  setLongformPlan: (sourceId: string, record: LongformPlanRecord) => void;
  addLongformPlanVersion: (
    sourceId: string,
    plan: LongformEditPlan,
    origin: LongformPlanVersionOrigin,
    note?: string,
  ) => void;
  restoreLongformPlanVersion: (sourceId: string, versionId: string) => void;
  acceptLongformPlan: (sourceId: string, skin: LongformSkinId, paletteId: string) => void;
  rejectLongformPlan: (sourceId: string) => void;
  addLongformPlanFeedback: (
    sourceId: string,
    feedback: Omit<LongformPlanFeedback, 'id' | 'createdAt' | 'status'>,
  ) => void;
  markLongformFeedbackApplied: (sourceId: string) => void;
  setLongformPreservedItems: (sourceId: string, items: PreservedLongformItem[]) => void;
  setLongformReconciliation: (
    sourceId: string,
    reconciliation: LongformRenderReconciliation | null,
  ) => void;
  clearLongformPlan: (sourceId: string) => void;
  getLongformPlan: (sourceId: string) => LongformPlanRecord | null;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneLongformPlan(plan: LongformEditPlan): LongformEditPlan {
  return JSON.parse(JSON.stringify(plan)) as LongformEditPlan;
}

export function getLongformVersions(record: LongformPlanRecord): LongformPlanVersion[] {
  if (record.versions && record.versions.length > 0) return record.versions;
  return [
    {
      id: record.activeVersionId ?? `legacy-${record.plan.generatedAt}`,
      plan: record.plan,
      origin: record.status === 'accepted' ? 'accepted' : 'generated',
      createdAt: record.plan.generatedAt,
    },
  ];
}

function ensureRecord(record: LongformPlanRecord): void {
  if (!record.versions || record.versions.length === 0) {
    record.versions = getLongformVersions(record);
  }
  if (!record.activeVersionId) {
    const latestVersionId = record.versions.at(-1)?.id;
    if (latestVersionId) record.activeVersionId = latestVersionId;
  }
  record.approvedVersionId ??= null;
  record.status ??= 'draft';
  record.feedback ??= [];
  record.preservedItems ??= [];
  record.reconciliation ??= null;
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
      ensureRecord(record);
      state.longformPlans[sourceId] = record;
    }),

  addLongformPlanVersion: (sourceId, plan, origin, note) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      const version: LongformPlanVersion = {
        id: makeId('cut-plan'),
        plan,
        origin,
        createdAt: Date.now(),
        ...(note ? { note } : {}),
      };
      record.versions?.push(version);
      record.plan = plan;
      record.activeVersionId = version.id;
      record.status = origin === 'accepted' ? 'accepted' : 'draft';
      record.approvedVersionId = origin === 'accepted' ? version.id : null;
      record.reconciliation = null;
    }),

  restoreLongformPlanVersion: (sourceId, versionId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      const version = record.versions?.find((candidate) => candidate.id === versionId);
      if (!version) return;
      record.plan = cloneLongformPlan(version.plan);
      record.activeVersionId = version.id;
      record.status = record.approvedVersionId === version.id ? 'accepted' : 'draft';
      record.reconciliation = null;
    }),

  acceptLongformPlan: (sourceId, skin, paletteId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      const version: LongformPlanVersion = {
        id: makeId('cut-plan'),
        plan: cloneLongformPlan(record.plan),
        origin: 'accepted',
        createdAt: Date.now(),
        note: 'Approved for render',
      };
      record.versions?.push(version);
      record.activeVersionId = version.id;
      record.approvedVersionId = version.id;
      record.status = 'accepted';
      record.skin = skin;
      record.paletteId = paletteId;
      record.reconciliation = null;
    }),

  rejectLongformPlan: (sourceId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.status = 'rejected';
      record.approvedVersionId = null;
      record.reconciliation = null;
    }),

  addLongformPlanFeedback: (sourceId, feedback) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.feedback?.push({
        ...feedback,
        id: makeId('feedback'),
        createdAt: Date.now(),
        status: 'pending',
      });
    }),

  markLongformFeedbackApplied: (sourceId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      for (const feedback of record.feedback ?? []) {
        if (feedback.status === 'pending') feedback.status = 'applied';
      }
    }),

  setLongformPreservedItems: (sourceId, items) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.preservedItems = items;
    }),

  setLongformReconciliation: (sourceId, reconciliation) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.reconciliation = reconciliation;
    }),

  clearLongformPlan: (sourceId) =>
    set((state) => {
      delete state.longformPlans[sourceId];
    }),

  getLongformPlan: (sourceId) => get().longformPlans[sourceId] ?? null,
});
