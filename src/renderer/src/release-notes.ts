export interface CreatorReleaseNote {
  version: string;
  title: string;
  summary: string;
  items: string[];
}

/** Curated creator-facing notes. Add one entry with every distributed release. */
export const CREATOR_RELEASE_NOTES: readonly CreatorReleaseNote[] = [
  {
    version: '0.1.0',
    title: 'A more finished cut room',
    summary: 'This release makes review, export, and app updates feel calmer and more trustworthy.',
    items: [
      'Opt-in studio sound cues now mark clip decisions, finished jobs, and problems.',
      'Successful export packs get a brief completion moment, with reduced motion respected.',
      'Loading shapes now reserve the same space as projects, previews, inspectors, and queues.',
      'Signed updates can download in the background and restart only after your project is saved.',
    ],
  },
];

export function releaseNotesThrough(version: string): readonly CreatorReleaseNote[] {
  const matching = CREATOR_RELEASE_NOTES.filter((note) => note.version === version);
  return matching.length > 0 ? matching : CREATOR_RELEASE_NOTES.slice(0, 1);
}
