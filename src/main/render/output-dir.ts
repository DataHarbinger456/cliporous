/**
 * output-dir — single source of truth for the app-wide default output folder.
 *
 * A brand-new user who never opened Settings still needs `Render Approved` /
 * `Render All` to produce files. `settings.outputDirectory` defaults to `null`,
 * so every consumer (render pipeline, manifest writer, "Open Output Folder")
 * resolves through here to a sensible default under the OS Videos directory.
 *
 * The render pipeline already `mkdirSync(..., { recursive: true })`s whatever
 * path it is handed, so callers only need the resolved string — directory
 * creation is lazy and happens at write time.
 */

import { join } from 'node:path'
import { app } from 'electron'

/**
 * The default output directory used when the user has not picked one:
 * `<OS Videos>/BatchClip` (e.g. `~/Movies/BatchClip` on macOS,
 * `%USERPROFILE%\Videos\BatchClip` on Windows).
 */
export function getDefaultOutputDirectory(): string {
  return join(app.getPath('videos'), 'BatchClip')
}

/**
 * Resolve the effective output directory: the user's choice when set, else the
 * app-wide default. Trims whitespace and treats empty strings as "unset".
 */
export function resolveOutputDirectory(dir?: string | null): string {
  const trimmed = (dir ?? '').trim()
  return trimmed.length > 0 ? trimmed : getDefaultOutputDirectory()
}
