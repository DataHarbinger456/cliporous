import type { CreativeBrief, CreativeBriefFields } from '@/store/types';

const FIELD_ORDER: Array<[keyof CreativeBriefFields, string]> = [
  ['audience', 'TARGET AUDIENCE'],
  ['goal', 'PROJECT GOAL'],
  ['callToAction', 'CALL TO ACTION'],
  ['tone', 'TONE'],
  ['mustInclude', 'MUST INCLUDE'],
  ['prohibitedClaims', 'PROHIBITED CLAIMS'],
  ['notes', 'CREATOR NOTES'],
];

export function creativeBriefHasUncommittedChanges(brief: CreativeBrief): boolean {
  if (!brief.committed) {
    return FIELD_ORDER.some(([key]) => brief[key].trim().length > 0);
  }
  return FIELD_ORDER.some(([key]) => brief[key] !== brief.committed?.[key]);
}

/**
 * Builds the creator-guidance block consumed by scoring and stitching.
 * Draft fields are deliberately ignored until commitCreativeBrief() snapshots them.
 */
export function buildCommittedCreativeGuidance(
  brief: CreativeBrief,
  fallbackAudience = '',
): string {
  const sections = FIELD_ORDER.flatMap(([key, label]) => {
    const value = brief.committed?.[key]?.trim();
    return value ? [`${label}:\n${value}`] : [];
  });

  return [fallbackAudience.trim(), ...sections].filter(Boolean).join('\n\n');
}
