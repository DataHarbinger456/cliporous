export interface MediaPathStatus {
  path: string;
  available: boolean;
}

export interface MediaSearchSource {
  id: string;
  path: string;
  name: string;
}

export interface MediaSearchResult {
  folderPath: string;
  matches: Record<string, string>;
  scannedFiles: number;
  truncated: boolean;
}
