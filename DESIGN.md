# BatchClip studio UI

## Design read

- **Surface:** Native desktop application UI for a repeated media-production workflow. BatchClip moves a creator from source ingestion through AI processing, clip approval, and rendering.
- **Audience:** A creator or editor working in a resizable Electron window, scanning many vertical clips and switching between quick approval decisions and slower AI/render progress.
- **Single job:** Make the next confident action obvious at every stage: bring in a source, understand the pipeline, approve the best clips, then export them.
- **Task and risk:** Ingestion and review are frequent, time-sensitive decisions. Processing and rendering are slower, failure-prone operations, so honest progress, recovery, and destination details must stay visible.
- **Content:** Source filenames, video thumbnails, clip scores, approval state, stage progress, render destinations, and truthful errors. Values can be long, missing, empty, or partially complete.
- **Platform:** Electron desktop window with mouse, keyboard, drag-and-drop, and resizable layouts. The supported primary window is 1280px or wider, with adaptive behavior tested down to a 900px working layout and a 320px reflow stress case.
- **Constraints:** Light is the default and dark is an explicit persisted choice. Light uses a warm canvas with white raised surfaces; dark keeps the locked brand seeds: espresso `#23100c`, cream `#f6ecd9`, and violet `#9f75ff`. Existing shadcn/Radix primitives, Lucide icons, Inter font assets, routing, pipeline handlers, and render subscriptions remain the source of truth.

## Evidence and direction

The local application evidence favors stable geometry, compact controls, semantic status colors, and named transitions. The material model is neutral and classic in light mode, while the existing espresso palette remains available for low-light sessions. Linear and Superhuman are aligned references for stable application hierarchy, compact controls, and keyboard-friendly orientation. Intercom is a contrast reference for keeping status and recovery visible, but its heavier workspace chrome is not appropriate here.

## Design thesis

BatchClip is a **quietly cinematic clip studio**: a warm light canvas or deep espresso surface, readable foreground text, violet for action, and named accents for pipeline, media, AI, transcription, face detection, and rendering. The distinctive product device is a static filmstrip rule/grid behind the work surface, paired with an always-present **Source → Shape → Export** stage rail in the draggable header. It grounds the composition in the editorial sequence without competing with real media.

- **First glance:** wordmark, current stage, source status, and the one primary action.
- **Second glance:** current screen title, useful count or progress, and recovery/status details.
- **Primary actions:** choose/drop source, cancel/retry processing, approve/reject/open clip details, render/export.
- **Supporting evidence:** real thumbnails and video previews, source filename, score, stage progress, render destinations, and actual errors.
- **Geometry:** 8px rhythm; 12px cards; 8px controls; pill shapes only for compact statuses and approval chips; shared content edges use a `max-w-6xl` clip workspace and `max-w-3xl` focused stages.
- **Typography:** self-hosted Inter remains the stable UI family. Tighter display tracking and weight carry headings; monospace is reserved for paths, percentages, and token counts.
- **Color roles:** `background` is the warm light canvas or espresso dark surface; `card` is the raised work surface; `muted-foreground` is measured secondary copy; violet is action/focus; `success`, `warning`, `destructive`, `info`, and `signal` cover common states. Source indicators are named: orange for pipeline/media, purple for AI, blue for transcription, yellow for render, cyan for face detection, and red for errors. Each indicator also carries text, an icon, a badge, or native progress semantics.
- **Motion:** the existing 150ms screen transition remains the only spatial transition. Added feedback uses property-specific color, border, opacity, shadow, and progress transitions. Reduced motion removes non-essential movement while preserving immediate state changes.
- **Anti-default check:** no glass cards, ambient loops, fake metrics, emoji, oversized hero, equal feature-tile grid, decorative icon medallions, generic hover lift, or generated em dashes. The filmstrip layer belongs because it directly references video editing and remains static behind content.

## Primitive and component map

| Area | Reuse | Responsibility |
| --- | --- | --- |
| App shell | `App.tsx`, `ScreenFrame`, `ErrorLog`, autosave toast, recovery dialog | Stage orientation, window drag region, route continuity, global recovery |
| Controls | `Button`, `Input`, `Label`, `Select`, `Switch`, `Progress` | Native/Radix semantics and consistent geometry/focus |
| Surfaces | `Card`, `Alert`, `AlertDialog`, `Badge`, `Skeleton` | Work surfaces, status, recovery, confirmation, loading |
| Intake | `DropScreen`, `PythonSetupCard` | Source selection, URL/path submission, mode, recent projects, setup/error |
| Pipeline | `ProcessingScreen` | Honest stage timeline, source context, cancel/resume/retry/settings |
| Review | `ClipGrid`, `ClipCard`, `ClipDetail`, `TemplateEditor` | Media-first approval decisions and render entry points |
| Export | `RenderScreen` | Production queue, per-row progress/errors, retry/cancel/destination actions |
| Header status | `AiUsageIndicator`, `ThemeToggle`, and Lucide | Saved state, AI usage, theme, settings, current stage |

## Component states

- **Header:** current stage, source availability, saved/unsaved, AI usage, Light/Dark toggle, settings, narrow numbered rail.
- **Source intake:** idle, drag-over, browsing, URL/path entry, submitting, invalid source, Python setup required, setup error, recent-project rows, empty recent list.
- **Processing:** active stage, completed stage, pending stage, paused/resumable, error/retry, cancel confirmation, settings handoff, source filename.
- **Review:** loading, empty, populated, selected detail, approved, rejected, keyboard focus, missing thumbnail, render-all confirmation, render entry.
- **Export:** setup, queued, active, completed row, failed row, retrying, canceled, open folder, open CSV, completion footer.

Every status pairs color with text, icon, or native progress semantics. Async actions retain useful content and expose pending, success, failure, retry, and cancel behavior.

## Responsive behavior

- **1280px and wider:** full stage rail and compact utility cluster; clip work uses the shared max-width with the existing 2/3/4-column behavior.
- **900px to 1279px:** stage rail compresses to numbered/current labels, utility controls wrap, intake and export actions stack where needed, and content edges remain aligned.
- **320px stress case:** controls reflow in DOM order, essential text remains readable without fixed content heights, long filenames/hook text wraps, clip cards preserve usable media geometry, and the primary action stays visible or one obvious action away.
- **All sizes:** preserve existing screen routing, keyboard order, drag alternative, labels, `aria-pressed` and role contracts, 44px practical targets, no-hover usability, and reduced-motion behavior.

## Accessibility and release contract

- Use native buttons, inputs, selects, labels, lists, progress semantics, and existing Radix dialogs.
- Keep visible focus rings, logical DOM/action order, accessible icon-only labels, and asynchronous status text.
- Verify keyboard traversal and completion, focus return from dialogs, 200% text zoom, 320px reflow, long filenames, missing media, empty/loading/error/retry/disabled/success/destructive states, reduced motion, and forced-colors where Electron exposes it.
- Do not rely on color, position, motion, or icon alone. Preserve drag-and-drop alternatives and truthful error recovery.

## Required release evidence checklist

- [x] Representative desktop Light and Dark renderer states verified through the bridge harness at 1440x900.
- [x] Narrow Light and Dark renderer states verified through the bridge harness at 390x844.
- [ ] `npm run check` passes. **Blocked by baseline:** the repository-wide check reports 783 diagnostics outside this theme work.
- [ ] `npm run typecheck` passes. **Blocked by baseline:** the repository-wide command reports unrelated main/shared/renderer/test errors; no theme-file errors remain.
- [x] Targeted `npx biome check` passes for the changed theme, indicator, settings, and renderer files.
- [x] `npm test` passes: 30 main test files / 326 tests and 12 renderer test files / 112 tests.
- [x] `npm run build` passes after the UI changes.
- [ ] Keyboard/focus, reduced motion, forced colors, 200% text zoom, and long-content checks are **unverified** manually in the Electron window.
- [x] Renderer source scan finds no `transition-all` or raw palette status classes in `src/renderer/src`. UI states pair color with text, icons, badges, or native progress semantics, and the UI changes did not alter pipeline or render orchestration.
- [x] Light/Dark persistence, pre-paint initialization, and cross-window convergence are covered by focused renderer tests.
- [x] Light and dark desktop plus narrow captures are re-verified after the theme change.

## Evidence log

- Desktop captures at 1440x900: `.ezcoder/screenshots/theme-light-desktop.png`, `.ezcoder/screenshots/theme-dark-desktop.png`, and `.ezcoder/screenshots/theme-settings-advanced.png`.
- Narrow captures at 390x844: `.ezcoder/screenshots/theme-light-narrow-verified.png` and `.ezcoder/screenshots/theme-dark-narrow.png`.
- Capture method: production renderer build served locally with the deterministic preload bridge harness, which allowed real screen composition and theme toggling without secrets or media files. Native Electron window pixels remain unverified in this headless environment.
- Verification run: focused theme tests passed 4/4; `npm test` passed 438/438 tests; `npm run build` passed; targeted Biome check passed for changed theme files. `npm run check` and `npm run typecheck` remain blocked by repository-wide diagnostics recorded above.
- Revision gate: kept the static filmstrip/grid layer because it is specific to video editing, preserved the 8px geometry and 150ms screen transition, centralized source indicators, and verified both material modes plus the Advanced Appearance control.
- Manual checks still needed in a real Electron window: stage rail at 1280px and 900px, source drag and browse focus flow, processing error and resume, clip keyboard approval, render retry/cancel, 320px reflow, 200% zoom, reduced motion, and forced colors.
