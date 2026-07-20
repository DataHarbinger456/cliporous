export type { RecentProjectEntry } from '@shared/recent-projects';
export { registerAiHandlers } from './ai-handlers';
export { registerBrandKitHandlers } from './brand-kit-handlers';
export { registerExportHandlers } from './export-handlers';
export { registerFfmpegHandlers } from './ffmpeg-handlers';
export { registerHyperFramesHandlers } from './hyperframes-handlers';
export { registerLifecycleHandlers } from './lifecycle-handlers';
export { registerLongformHandlers } from './longform-handlers';
export { registerMediaHandlers } from './media-handlers';
export { registerMenuHandlers } from './menu-handlers';
export {
  addRecentProject,
  loadRecentProjects,
  registerProjectHandlers,
  saveRecentProjects,
} from './project-handlers';
export { registerRenderHandlers } from './render-handlers';
export { registerSecretsHandlers } from './secrets-handlers';
export {
  deleteBatchContentTempFiles,
  getAutoCleanupOnExit,
  registerSystemHandlers,
  setAutoCleanupOnExit,
} from './system-handlers';
export { registerUpdateHandlers } from './update-handlers';
