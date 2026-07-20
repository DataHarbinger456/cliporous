export type RecentProjectKind = 'short' | 'longform';

export interface RecentProjectEntry {
  path: string;
  name: string;
  sourceName: string | null;
  lastOpened: number;
  clipCount: number;
  selectedCount: number;
  sourceCount: number;
  kind: RecentProjectKind;
  stage: string;
  missingMedia: boolean;
  pinned: boolean;
  poster: string | null;
  selectedFrames: string[];
}

export interface RecentProjectRenameResult {
  oldPath: string;
  entry: RecentProjectEntry;
}
