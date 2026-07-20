# EZ Coder to Cliporous UX roadmap

## Bottom line

Do **not** copy EZ Coder's terminal skin, Matrix language, or developer controls.

Copy its product behavior: a signature entry experience, durable continuity, transparent long-running work, dense keyboard QoL, human errors, restrained tactile feedback, and small celebrations.

Express that as a **creator's cut room** where footage, hooks, selects, timelines, and finished exports provide the personality.

## Audit scope

This review covered:

- the 111 files under `/Users/groot/ezcoder/ezcoder-app/src`, including the 60 non-test TSX/CSS UI files;
- the EZ Coder app shell, project/session pickers, activity surfaces, composer QoL, modal behavior, window management, updater, sound, progress, errors, and release notes;
- all 53 EZ Coder changelog entries and roughly 127 user-facing release bullets;
- rendered EZ Coder home, project, session, plan, task, and settings states at wide and narrow sizes;
- Cliporous' current app shell, four screens, settings window, project persistence, recovery, history, render queue, preload API, screenshots, `DESIGN.md`, and prior UX plans;
- the current dirty Cliporous working tree as read-only product evidence. This roadmap does not overwrite or reinterpret the in-progress promo/HyperFrames work.

### Primary evidence

EZ Coder:

- `../ezcoder/ezcoder-app/src/App.tsx`
- `../ezcoder/ezcoder-app/src/App.css`
- `../ezcoder/ezcoder-app/src/HomeScreen.tsx`
- `../ezcoder/ezcoder-app/src/ProjectPicker.tsx`
- `../ezcoder/ezcoder-app/src/ActivityBar.tsx`
- `../ezcoder/ezcoder-app/src/LiveToolPanel.tsx`
- `../ezcoder/ezcoder-app/src/TasksModal.tsx`
- `../ezcoder/ezcoder-app/src/MemoryModal.tsx`
- `../ezcoder/ezcoder-app/src/NotesModal.tsx`
- `../ezcoder/ezcoder-app/src/PlanReviewModal.tsx`
- `../ezcoder/ezcoder-app/src/ZoomController.tsx`
- `../ezcoder/ezcoder-app/src/WindowLayoutButton.tsx`
- `../ezcoder/ezcoder-app/src/WhatsNewWindow.tsx`
- `../ezcoder/ezcoder-app/src/changelog.ts`

Cliporous:

- `DESIGN.md`
- `.ezcoder/plans/ux.md`
- `.ezcoder/plans/ui-overhaul.md`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/screens/DropScreen.tsx`
- `src/renderer/src/components/ProcessingScreen.tsx`
- `src/renderer/src/components/ClipGrid.tsx`
- `src/renderer/src/components/ClipCard.tsx`
- `src/renderer/src/components/ClipDetail.tsx`
- `src/renderer/src/components/screens/RenderScreen.tsx`
- `src/renderer/src/SettingsWindow.tsx`
- `src/renderer/src/store/history-slice.ts`
- `src/renderer/src/services/project-service.ts`
- `src/main/ipc/project-handlers.ts`
- `src/preload/index.d.ts`

## Critical findings before visual polish

### 1. Saved project and recovery files can contain API keys

`src/renderer/src/services/project-service.ts:17-29` serializes the complete `state.settings` object.

That object contains Gemini, Pexels, and fal.ai credentials after safeStorage hydration, so both manual `.batchclip` files and the recovery file can receive plaintext secrets.

**Immediate rule:** do not share a `.batchclip` file until `TRUST-01` is complete.

### 2. Recovery is effectively acknowledged forever

`src/renderer/src/store/index.ts:158-163` stores one permanent `batchclip-acknowledged-recovery=true` value.

`src/renderer/src/App.tsx:261-305` then skips every future recovery check, including after a later crash.

### 3. Save is always Save As

`src/main/ipc/project-handlers.ts:117-130` opens a save dialog on every Save action because there is no current project path.

This breaks the normal desktop meaning of `Cmd/Ctrl+S` and weakens autosave confidence.

### 4. The autosave interval control does nothing

`src/renderer/src/SettingsWindow.tsx:453-473` lets the user select 10 seconds to 5 minutes.

`src/renderer/src/services/project-service.ts:168-195` still hard-codes 60 seconds and never reads that setting.

### 5. Undo exists but users cannot reach it

`src/renderer/src/store/history-slice.ts:43-65` implements global and per-clip undo/redo.

The app exposes neither buttons nor standard `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` shortcuts.

### 6. AI usage events are not connected to the usage UI

The preload exposes `onAiTokenUsage`, and the store exposes `trackTokenUsage`, but no renderer code subscribes one to the other.

The usage indicator therefore cannot reliably show the session usage it claims to summarize.

### 7. Long-form AI plans bypass review

`src/renderer/src/components/screens/RenderScreen.tsx:109-116` explicitly notes that the AI plan flows directly into render without an approval step.

This is the clearest Cliporous equivalent of EZ Coder's plan review and should be one of the first creator-focused transfers.

### 8. Useful engine capabilities are already exposed but have no product surface

The preload already exposes waveform extraction, real low-quality render previews, hook generation, rescoring, description generation, key validation, disk space, encoder information, temp/cache cleanup, resource usage, and render fallback events.

The fastest route to a richer creator experience is to surface these existing capabilities before inventing new backend systems.

### 9. The native window contradicts the responsive UI

The renderer has narrow layouts and 320px stress captures, but `src/main/index.ts:49-50` locks the actual app to a minimum 1280×800 window.

That prevents split-screen and smaller-laptop use despite the responsive work already completed.

## Design read

- **Surface:** desktop media-production application, led by application UI with an editorial/content secondary archetype.
- **Audience:** solo creators and editors who repeatedly ingest long videos, wait on local/AI work, triage many candidates, refine a few, and export deliverables.
- **Single job:** turn one or more source videos into trusted, publish-ready cuts without losing work or wondering what the app is doing.
- **Frequency:** source intake and clip triage are frequent; setup and brand choices are occasional; processing and rendering are long-running.
- **Decision cost:** approving the wrong moment wastes render time and publishing opportunity; losing a transcript, plan, or project can cost hours.
- **Content:** real video, poster frames, waveforms, transcript text, hook variants, AI rationale, safe zones, filenames, paths, progress, output files, and social copy.
- **Platform:** Electron on macOS and Windows, pointer plus keyboard, resizable windows, file drag/drop, native dialogs, OS notifications, and long background jobs.
- **Constraint:** preserve the existing light default, explicit espresso dark mode, violet brand action, static filmstrip signature, shadcn/Radix primitives, Lucide icons, and restrained motion budget.

## One resolved direction: The Creator Cut Room

Cliporous should feel like a calm editorial bay, not an AI dashboard.

- **First glance:** current project, source image, stage, and next action.
- **Second glance:** what the app found, what still needs a decision, and what is running.
- **Signature:** a real contact sheet of source and selected frames, with a restrained cut/playhead line that moves only when real progress or playback changes.
- **Material:** warm canvas and white edit surfaces in light mode; deep espresso screening-room surfaces in dark mode; real media owns the strongest contrast.
- **Type:** keep Inter for UI speed. Let real hook/caption typography appear inside media previews instead of turning app chrome into a display-font showcase.
- **Motion:** finite state transitions, progress, scrub/playhead continuity, and completion feedback. Resting screens stay still.
- **Voice:** concise creative-director language: “Your selects are ready”, “3 moments need review”, “Export pack ready”. Technical language lives behind Details.
- **Delight:** sound and celebration only at meaningful moments such as first successful export or a clean batch completion.

## Keep what Cliporous already does well

These are foundations, not redesign targets:

- the **Source → Shape → Export** stage rail;
- the static filmstrip/grid motif;
- light default plus explicit espresso dark mode;
- real thumbnail and muted hover-preview behavior;
- inline failure/retry paths on processing and render screens;
- per-clip render progress, retry-failed, reveal, and manifest export;
- first-run setup progress, offline detection, and repair state;
- autosave intent and crash-recovery intent;
- recent project entry points;
- AI usage/cost intent;
- template safe-zone visualization and long-form palette/skin previews;
- Radix dialog/focus infrastructure, Lucide icon family, visible focus, reduced-motion CSS, and the single 150ms screen transition.

## Transfer map

| EZ Coder pattern | Cliporous adaptation | Decision |
| --- | --- | --- |
| Signature home with bespoke backdrop | Project lobby built from real source posters and past selects | **Adapt now** |
| Floating coding memes | Real project contact sheets or paused best-moment frames | **Replace, no external GIFs** |
| ASCII/Matrix identity | Editorial contact sheet, waveform, timecode, and cut-line identity | **Do not transfer** |
| Project and session picker with search | Searchable project library with last stage, output mode, counts, and poster | **Adopt now** |
| Exact session resume | Restore project, stage, selected clip, filters, inspector, playhead, and scroll | **Adopt now** |
| Collapsible workspace chrome | Collapsible utility groups and wide/narrow workspace recomposition | **Adopt** |
| Live tool panel | Last 3 content operations: transcript, moments, faces, styling, export prep | **Adapt now** |
| Activity bar with elapsed, tokens, and cancel | Studio HUD with elapsed, ETA, stage, output count, and honest Cancelling state | **Adapt now** |
| Background task popover | Durable analysis/render queue available from every screen | **Adapt now** |
| Context and subscription meters | AI spend plus disk, output-size, encoder, and queue preflight | **Adapt** |
| Project Tasks | Batch queue and optional deliverables checklist | **Adapt** |
| Per-project Notes | Creative Brief | **Adopt** |
| Brain/Memory curation | Creator Profile and Brand Kit with inspect/edit/delete controls | **Adapt** |
| Prompt Enhancer | Hook Polish with before/after diff, Apply, and Undo | **Adapt now** |
| Attachment chips, paste, and drag/drop | Multi-source tray with posters, duration, reorder, remove, and queued analysis | **Adapt** |
| Queued mid-run messages | Queued imports, re-analysis, and renders with explicit order | **Adapt** |
| Full-screen plan review | Long-form Cut Plan review with accept, feedback, regenerate, and reject | **Adopt now** |
| Human error headline/message/guidance | “What happened / what is safe / what to do next” plus technical details | **Adopt now** |
| Provider connection hub | Connections cards with configured, tested, optional, and degraded states | **Adapt now** |
| Shape-matched skeletons | Poster, list, inspector, and footer skeletons matching final geometry | **Adopt** |
| UI zoom with percentage HUD | `Cmd/Ctrl +`, `-`, `0` with persisted zoom and a small HUD | **Adopt** |
| Keyboard menus and shortcuts | Command palette plus review-mode shortcuts | **Adapt now** |
| Multi-window tiling | Wide master-detail first; second-display preview later | **Defer direct transfer** |
| OS permission refresh on focus | Re-check notification, folder, disk, and media access after returning to app | **Adopt** |
| Self-update banner and What’s New | Signed app updates plus creator-facing release notes | **Adopt before distribution** |
| Sounds and one-shot confetti | Optional tactile cues and finite first-export/batch-complete celebration | **Adapt later** |
| XP/rank scorecard | Honest local studio stats only, with no artificial grind | **Optional later** |
| Internet radio | No app radio; a future soundtrack audition feature must affect the content | **Do not transfer** |
| MCP, model power controls, terminal output | Keep technical controls in Advanced/Details only | **Do not transfer** |
| Sub-agent names and tool logs | Show creator-facing artifacts, not AI orchestration internals | **Do not transfer** |
| Webcam gaze focus | No product fit | **Do not transfer** |
| Telegram coding remote | Prefer a future watch folder/import inbox if remote intake is needed | **Do not transfer now** |

## Priority and size key

- **P0:** trust or correctness; complete before visual expansion
- **P1:** defines the comparable creator-studio feel
- **P2:** power-user speed and depth
- **P3:** optional delight or later expansion
- **S:** up to about 1 day
- **M:** about 2 to 3 days
- **L:** about 4 to 7 days
- **XL:** multi-week or backend-heavy epic

Estimates are relative planning sizes, not delivery promises.

# Full implementation task list

## Phase 0: Trust, persistence, and desktop correctness

### `TRUST-01` [P0, M] Strip secrets from projects and recovery

- Add a project serializer that explicitly omits Gemini, Pexels, and fal.ai keys.
- Ignore any credentials found in loaded legacy project files.
- Keep credentials exclusively in safeStorage.
- Add tests proving saved and recovery JSON cannot contain known secret fields or test token values.
- Provide a documented, opt-in cleanup utility for existing `.batchclip` files rather than silently rewriting user files.

**Primary paths:** `src/renderer/src/services/project-service.ts`, `src/renderer/src/store/helpers.ts`, project-service tests.

### `TRUST-02` [P0, L] Define app, creator-profile, and project setting scopes

- **App scope:** credentials, output folder default, autosave, notifications, theme, cleanup, developer mode.
- **Creator profile scope:** target audience, CTA assets, reference captures, default platform, long-form palette/skin.
- **Project scope:** output mode, source state, scoring recipe, selected profile, clip decisions, plans, per-project overrides.
- Loading a project must not replace app credentials or unrelated global preferences.
- Version the project schema and add migrations.

**Primary paths:** store types/helpers, project service, Settings window, new creator-profile store.

### `PROJ-01` [P0, L] Add current project identity

Track project id, display name, file path, created/modified timestamps, and schema version in state.

**Done when:** window title, header, Save, autosave, recovery, recents, and reopen all refer to the same project identity.

### `PROJ-02` [P0, M] Implement normal Save and Save As

- `Cmd/Ctrl+S` writes atomically to the current path.
- first Save or explicit Save As opens the native dialog.
- Save uses temp-file plus rename so a crash cannot leave a half-written project.
- failed saves keep dirty state and show a recoverable error.

**Primary paths:** project IPC handlers, channels, preload, project service, native app menu.

### `PROJ-03` [P0, M] Make autosave real and honor its setting

- Replace the hard-coded 60-second timer with the persisted interval.
- Autosave the current project file when one exists, plus a separate recovery snapshot.
- Debounce safely during rapid clip edits.
- Show `Saving`, `Saved just now`, and `Save failed` without toast spam.

### `PROJ-04` [P0, M] Fix recovery acknowledgement

- Scope acknowledgement to a specific recovery snapshot id/hash, not forever.
- Check on every app launch.
- Show source/project name, autosave time, stage, and recoverable asset counts.
- Preserve the recovery file when Restore fails.
- Confirm Discard with the concrete project name and consequence.

### `PROJ-05` [P0, L] Add close, quit, and restart safety

- Intercept native window close while dirty, processing, preparing, or rendering.
- Offer Save and Quit, Quit Without Saving, and Cancel.
- During active work, offer Keep Running in Background where supported or Stop and Quit.
- Await save/cancel settlement in the main process instead of relying on async `beforeunload`.

### `PROJ-06` [P0, L] Restore the exact workspace

Persist and restore:

- screen/stage;
- active source;
- selected/open clip;
- clip filters and sort;
- inspector/tab state;
- grid scroll position;
- preview playhead when useful;
- active render queue and completed outputs.

Restore without flashing the drop screen.

### `PROJ-07` [P0, L] Add missing-media relink

- Detect missing or moved source files on open.
- Show offline-media cards rather than broken previews.
- Offer Locate, Locate All in Folder, Remove Source, and Keep Offline.
- Rebase matching paths in one action.
- Block only operations that need the missing media; preserve transcript, clips, decisions, and plan.

### `EDIT-01` [P0, M] Wire standard undo and redo

- `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` use the existing history slice.
- Add toolbar buttons with disabled states and action-specific labels.
- Route to per-clip history while the inspector owns focus and global history otherwise.
- Show a brief “Hook change undone” or “Approval restored” status.
- Add undo for approval/rejection and bulk operations, not only trim/text edits.

### `EDIT-02` [P0, M] Stop Render All from rewriting review decisions

Render explicit clip ids without converting rejected clips to approved.

**Done when:** “Render all” can include rejected clips for that batch while the review status remains rejected afterward.

### `ERR-01` [P0, L] Create one structured error contract

Every main/AI/Python/render error should provide:

- short headline;
- plain-language explanation;
- safe recovery action;
- retryability and failed stage;
- optional provider/source/status code;
- redacted technical details and log correlation id.

Never put raw provider JSON, credentials, or giant stderr blocks in the primary UI.

### `ERR-02` [P0, M] Separate creator recovery from diagnostics

- Inline errors show the next action.
- Technical Error Log stays collapsed unless the user opens Details.
- Keep Copy Diagnostics, Export Logs, and Open Log Folder.
- Add Retry, Open Settings, Relink, Free Space, or Resume buttons where applicable.

### `RUN-01` [P0, M] Add honest cancellation states

- Processing and render buttons change to `Cancelling…` immediately.
- Disable duplicate cancellation.
- Do not reset/discard visible work until child processes settle.
- If cancellation fails, state plainly that work is still running and allow retry.
- Keep completed clips and cached transcription.

### `CONN-01` [P0, M] Validate connections in Settings

Use the existing `validateGeminiKey` path and add equivalent health checks where possible.

Each card shows `Not configured`, `Testing`, `Connected`, `Invalid`, or `Optional and unavailable`, plus exactly which features degrade.

### `USAGE-01` [P0, S] Connect AI usage events to the store

Subscribe `window.api.onAiTokenUsage` once at renderer startup and call `trackTokenUsage`.

Add a regression test proving a bridge event updates the header indicator.

### `USAGE-02` [P0, M] Make cost estimates auditable

- Move model/pricing data out of the component.
- Show model id, pricing date/version, and `Estimated` wording.
- Do not silently calculate one model's price for another model.
- Keep token/cost details in the utility popover, not the creative workspace.

### `SETUP-01` [P0, L] Make the 2–3 GB first-run install an informed action

- Check network and free disk space first.
- Explain download size, expected time, storage location, and why it is needed.
- Ask the user to start the download instead of beginning a multi-gigabyte install invisibly.
- Support retry and cancel.
- If a source is chosen first, queue it and continue automatically after setup.

### `WIN-01` [P0, L] Make the native window genuinely adaptive

- Lower the 1280px minimum only after the corresponding layouts pass.
- Target a practical 900px minimum for the production app.
- Persist bounds, maximized state, and display.
- Recompose, rather than merely wrap, at intermediate widths.
- Verify Windows titlebar controls and macOS traffic-light insets.

### `WIN-02` [P0, M] Add a native application menu

Expose New Project, Open, Open Recent, Save, Save As, Undo, Redo, Zoom, Settings, Keyboard Shortcuts, Check for Updates, and About with platform-standard shortcuts.

## Phase 1: Creator-studio shell and project lobby

### `HOME-01` [P1, L] Turn the drop screen into a project lobby

The first screen should contain:

1. one primary `Drop video` / `Choose video` action;
2. a URL field as a clear alternative;
3. recent projects with real poster frames;
4. New Project, Open Project, and Import actions;
5. setup/connection blockers only when relevant.

Keep marketing copy out of the working app.

### `HOME-02` [P1, L] Build the real-media contact-sheet signature

- Store a safe poster and up to three selected frames in recent-project metadata.
- Use them as a static contact sheet around or above the primary intake action.
- Hover/focus may play a short muted preview only after user intent.
- Missing media falls back to generated neutral frame geometry, not fake imagery.
- Reduced motion shows still frames.

This replaces EZ Coder's constellation/meme energy with content-authentic personality.

### `HOME-03` [P1, M] Upgrade recent projects into a searchable library

Each row/card shows poster, name, source, output mode, clip/select count, last stage, last opened, and missing-media status.

Add search, recent/pinned sorting, Reveal, Rename, Duplicate, Remove from Recents, and Delete Project File as a separately confirmed action.

### `HOME-04` [P1, M] Add a clean New Project flow

Collect only project name, source, and output mode up front.

Optional Brief/Profile choices stay one obvious step away and never block first use.

### `HOME-05` [P1, M] Add OS project-file integration

- Register `.batchclip` file association.
- Open a project when its file is double-clicked or passed to a second instance.
- Update OS recent documents.
- Focus the existing window safely.

### `SHELL-01` [P1, M] Put project identity and save truth in the header

Show project name, source name, dirty/saving/saved state, and current stage without relying on a tiny unlabeled dot.

Use the native window title for project and running-state context too.

### `SHELL-02` [P1, M] Build a creator command palette

`Cmd/Ctrl+K` opens searchable actions:

- New/Open/Save/Save As;
- jump to Source, Review, or Export when valid;
- approve/reject selected clip;
- render selected/approved;
- open Creative Brief, Creator Profile, Template, Settings, output folder, and logs;
- toggle theme and sound;
- show shortcuts.

Disabled results explain the prerequisite.

### `SHELL-03` [P1, S] Persist workspace display preferences

Remember grid density, filters, sort, inspector width/open state, collapsed activity feed, theme, sound, and zoom.

Project-specific choices stay with the project; app display preferences stay global.

### `SHELL-04` [P1, M] Make header controls adaptive and consistent

- Keep the primary action visible.
- Collapse low-frequency utilities into one menu before labels become icon-only ambiguity.
- Use the same labels and icon order on every screen.
- Treat the stage rail as either an ordered progress list or valid navigation, not a non-interactive `nav` imitation.

### `SHELL-05` [P1, M] Add persisted UI zoom

Implement `Cmd/Ctrl +`, `-`, and `0`, 50% to 200%, with a small percentage HUD and cross-window persistence.

Verify controls do not overlap at 200%.

### `SHELL-06` [P1, S] Make platform copy accurate

Use `Reveal in Finder` on macOS, `Show in Explorer` on Windows, and a neutral equivalent elsewhere.

Audit shortcut glyphs, path formatting, and native terminology in all screens.

### `BRIEF-01` [P1, M] Add a per-project Creative Brief

A lightweight autosaved panel for audience, goal, CTA, tone, must-include points, prohibited claims, and free-form notes.

Pipeline prompts can consume structured fields only after the user saves them.

### `PROFILE-01` [P1, XL] Add an inspectable Creator Profile / Brand Kit

- reusable profiles across projects;
- target audience and tone;
- logo and evidence/capture assets for promo mode;
- CTA defaults;
- long-form palette and skin defaults;
- default target platform and safe-zone layout;
- missing-asset health.

Respect locked product rules: vertical keeps the single PRESTYJ style, three caption modes, and fixed violet accent unless the product invariant is intentionally changed in a separate decision.

### `PROFILE-02` [P1, M] Add transparent preference memory

List every learned/saved preference with source, scope, updated date, and Delete/Edit actions.

Never silently infer a preference into permanent state without making it reviewable.

### `SETTINGS-01` [P1, L] Reorganize Settings around creator concepts

Recommended sections:

- **Connections:** API health and degraded features;
- **Output:** default folder, naming, quality, concurrency;
- **Studio:** notifications, sound, appearance, zoom;
- **Storage:** temp/cache size, automatic cleanup, logs;
- **Advanced:** developer mode and raw engine details.

Auto-save non-secret preferences; require Test and Save for credentials.

## Phase 2: Transparent processing and background work

### `PROCESS-01` [P1, M] Show the actual source while processing

Use source poster, duration, dimensions, output mode, and a compact waveform or filmstrip in the left panel instead of mostly empty decorative space.

### `PROCESS-02` [P1, L] Add a creator-facing live activity feed

Show the most recent three meaningful operations, for example:

- `Transcribed 12:08 of 42:31`;
- `Found a 91-score hook: “…”`;
- `Built a 3-part stitched story`;
- `Detected 2 speakers across 7 scenes`;
- `Styled 8 candidate clips`.

Allow collapse, keep details available, and never expose tool or sub-agent names.

### `PROCESS-03` [P1, M] Add stage result summaries

Completed stages settle into compact proof:

- transcript word count and language;
- candidate count and score range;
- stitched clip count;
- seconds removed by loop/filler optimization;
- face-detection coverage;
- style decisions and fallback count.

Use real values only.

### `PROCESS-04` [P1, M] Add honest elapsed and ETA behavior

- Always show elapsed on long stages.
- Show ETA only after enough samples make it stable.
- Label unstable estimates as `Estimating…`.
- Explain known long pauses.
- Keep layout geometry stable as text changes.

### `PROCESS-05` [P1, XL] Move processing into a durable job model

- Job id, project id, stage, progress, started time, cached artifacts, cancel state, and error live outside one mounted screen.
- The user can return to the project lobby while work continues.
- Reopening the app resumes from the last safe checkpoint or explains why it cannot.

### `PROCESS-06` [P1, L] Add a global Jobs HUD

Available from every screen and the project lobby:

- running/queued/completed/failed counts;
- compact progress rows;
- open project, cancel, retry, and reveal output;
- no screen takeover for background work.

This is the content-creation version of EZ Coder's background-task popover.

### `PROCESS-07` [P1, M] Integrate native progress and notifications

- Windows taskbar/macOS dock progress during processing and render.
- Notifications when clips are ready, render completes, or action is required.
- Clicking a notification focuses the app and opens the relevant project/screen.
- Expose the existing notification preference in Settings.

### `PROCESS-08` [P1, M] Preserve useful work through cancel and failure

Offer `Stop and keep progress` by default.

Place `Start over and discard cache` behind an explicit secondary action.

### `PROCESS-09` [P2, M] Add optional resource details

Use existing resource/encoder APIs in a Details popover only when helpful: encoder, hardware acceleration, app RAM, GPU state, and bottleneck hint.

Do not turn the main screen into a monitoring dashboard.

## Phase 3: Fast clip review and editing

### `REVIEW-01` [P1, M] Finish filters and sort from the existing UX spec

Add All, Unreviewed, Approved, Rejected, and Stitched filters plus Score, Source Time, Duration, and Status sort.

Show active result count and a real no-results state distinct from no clips.

### `REVIEW-02` [P1, M] Add review-mode keyboard triage

- Left/Right or J/K: previous/next clip;
- Space: play/pause;
- A: approve;
- X: reject;
- U: return to unreviewed;
- E or Enter: open editor;
- `Cmd/Ctrl+Z`: undo;
- R: render selected/approved through an explicit action.

Shortcuts do not fire while typing or while a dialog owns focus.

### `REVIEW-03` [P1, S] Auto-advance after a decision

After approve/reject, move to the next unreviewed clip while preserving scroll and focus.

Let users turn auto-advance off.

### `REVIEW-04` [P1, M] Add clear undo feedback for decisions

Use a compact status/toast with Undo after approval, rejection, bulk changes, trim, and hook edits.

Do not confirm cheap reversible decisions.

### `REVIEW-05` [P1, L] Recompose wide review as master-detail

At wide widths, keep the grid/contact sheet visible beside a persistent clip inspector.

At narrower widths, retain the current Sheet.

Selection, playhead, and edits survive recomposition.

### `REVIEW-06` [P1, M] Add previous/next clip navigation in the inspector

Buttons and Arrow keys move between clips without closing the inspector.

Show `4 of 12` and retain the current filter context.

### `REVIEW-07` [P1, M] Use the existing waveform API in trim

- Render source waveform behind the range selection.
- Add keyboard-accessible trim handles and numeric inputs.
- Add Reset to Auto.
- Show speech gaps/cut boundaries when available.
- Preserve a non-drag editing path.

### `REVIEW-08` [P1, L] Use the real render-preview API

Replace the approximate overlay-only preview with the existing low-quality rendered preview for hook, captions, crop, auto-zoom, and overlays.

Keep the approximation as an instant placeholder while the preview generates.

### `REVIEW-09` [P1, M] Make preview generation feel immediate

- Debounce edits;
- cancel stale preview work;
- cache by clip plus settings hash;
- clean temp previews on close/replacement;
- show preparing, ready, failed, and retry states without blocking text edits.

### `REVIEW-10` [P1, M] Improve playback controls for editorial review

- Hover previews remain muted.
- Inspector playback starts only on explicit action and remembers volume.
- Add 5-second seek, frame/100ms nudge, replay selection, and loop-selection shortcuts.
- Never surprise users with audio.

### `REVIEW-11` [P1, M] Surface the score as a decision aid

Show the overall score plus available breakdown/reasoning in a `Director's note` section.

State that it is an AI estimate, not performance certainty.

### `REVIEW-12` [P1, L] Build Hook Polish

Adapt EZ Coder's Prompt Enhancer:

- generate one stronger hook using the existing API;
- show original and suggestion side by side;
- highlight meaningful changes;
- Apply, Try Another, Keep Original, and Undo;
- retain user text on failure;
- use a short finite transition, with an immediate reduced-motion path.

### `REVIEW-13` [P2, M] Add rescore/regenerate for one clip

Use the existing `rescoreSingleClip` path.

Show exactly what will change: score, reasoning, hook, or boundaries. Never overwrite trim/status without explicit consent.

### `REVIEW-14` [P2, M] Expose re-hook generation where the render feature is active

Preview generated re-hook text and timing, allow edit/disable, and show it in the real preview.

### `REVIEW-15` [P1, L] Add transcript search and source navigation

Search words/phrases, jump video to a result, show the selected clip's transcript range, and create a new candidate from a selected transcript range.

### `REVIEW-16` [P2, L] Add multi-select and bulk operations

Checkbox/selection mode with keyboard support for approve, reject, return to unreviewed, render, and apply eligible shared settings.

Bulk actions always state the count and support Undo where cheap.

### `REVIEW-17` [P2, L] Add side-by-side compare

Compare two candidates or hook variants with synchronized playback, score/rationale, duration, and status.

Use this before pursuing multi-window tiling.

### `REVIEW-18` [P2, M] Add score/time contact-sheet density modes

Offer Comfortable and Compact grid densities, persisted per user, without shrinking controls below target sizes.

### `REVIEW-19` [P1, M] Complete Template Editor accessibility

- Replace emoji platform-button stand-ins with Lucide or neutral geometric mock controls.
- Add arrow-key nudging, Shift for larger steps, numeric X/Y fields, reset, and announced snap state.
- Use a real source frame when available.
- Keep drag as one option, not the only option.

### `REVIEW-20` [P1, M] Harden missing/failed media states

Broken thumbnail, unavailable source, preview error, and unsupported codec each get distinct copy and recovery.

Do not leave blank black players or generic Play icons as the only explanation.

## Phase 4: Cut-plan and creator-profile flow

### `PLAN-01` [P1, XL] Add a long-form Cut Plan review screen

Before render, show:

- sections and timing;
- phrase overlays;
- concept cards and blocks;
- planned B-roll/evidence moments;
- style/palette;
- dropped or unsupported items;
- estimated render duration.

Primary actions: Accept and Continue, Send Feedback, Regenerate, and Reject.

### `PLAN-02` [P1, L] Make plan feedback focused

Feedback can target the whole plan or one item.

Examples: remove a block, change wording, move timing, replace visual type, or preserve a section.

Keep accepted user edits across regeneration where possible.

### `PLAN-03` [P1, M] Keep plan versions

Store generated, user-edited, and accepted versions with timestamps.

Allow Compare and Restore without paying for another generation.

### `PLAN-04` [P1, M] Show plan-to-render reconciliation

After preparation/render, report planned versus rendered counts and explain each fallback or dropped item.

Use the existing render summary and segment-fallback event rather than silently losing visuals.

### `PROFILE-03` [P2, L] Build a real asset library for the Brand Pack

- thumbnails and media type;
- category/tags;
- preview;
- missing path/relink;
- replace/delete;
- CTA designation;
- usage count and last used.

No invented testimonial or proof assets.

### `PROFILE-04` [P2, M] Preview profile choices against real content

Use a representative project frame and actual profile assets before saving defaults.

## Phase 5: Durable production queue and export payoff

### `EXPORT-01` [P0, L] Unify all render jobs in one UI model

Regular clips, stitched clips, and long-form jobs must share one queue representation so counts and rows cannot omit stitched work.

### `EXPORT-02` [P1, XL] Persist the render queue

Store queued/running/completed/failed jobs, options hash, output path, and checkpoints.

After restart, verify existing outputs and resume remaining safe jobs rather than re-rendering everything.

### `EXPORT-03` [P1, L] Add export preflight

Before starting, show:

- destination;
- free disk space;
- estimated output size;
- active encoder and hardware acceleration;
- quality/resolution/fps;
- clip count and total duration;
- missing optional credentials/assets and exact degradation.

Block only true failures.

### `EXPORT-04` [P1, M] Add honest duration and size estimates

Base estimates on clip duration, quality preset, encoder history, and recent local render timings.

Label early values as estimates and improve them with measured local data.

### `EXPORT-05` [P1, L] Add queue controls

- reorder queued jobs;
- cancel one queued job;
- stop after current clip;
- retry one failed job;
- retry all failed;
- clear completed rows;
- reveal completed output.

Provide keyboard and button alternatives to drag reorder.

### `EXPORT-06` [P2, XL] Define safe pause/resume semantics

Default to `Stop after current clip and keep queue`.

Only offer mid-encode Pause if FFmpeg/Remotion can resume without corrupting output; otherwise do not fake it.

### `EXPORT-07` [P1, M] Show preparation activity per job

Translate feature preparation into creator language: filler cleanup, captions, B-roll, visual cards, crop, overlays, encode.

Show only the current and most recent events by default.

### `EXPORT-08` [P1, M] Surface visual fallbacks

Subscribe to `onSegmentFallback` and report concrete outcomes such as `2 image moments used talking-head because no asset was available`.

Include Fix and Render Again when actionable.

### `EXPORT-09` [P1, L] Make completion a media payoff

Show a real contact sheet of completed outputs with Play, Reveal, Copy Path, and Render Again.

Keep failed jobs visible with retry; do not collapse away evidence users still need.

### `EXPORT-10` [P1, L] Add a social copy pack

Use existing description APIs to show per-platform caption, hashtags, short description, and best-time data only when generated from a real source.

Provide Copy per platform and Open CSV. Label generic fallbacks clearly instead of presenting them as tailored AI output.

### `EXPORT-11` [P2, M] Expose filename templates safely

Live-preview filenames for real clips, sanitize invalid platform characters, detect collisions, and provide Reset.

### `EXPORT-12` [P2, M] Expose simple quality and concurrency presets

Use plain choices such as Draft Preview, Standard, and Master.

Put CRF, encoder preset, and raw concurrency under Advanced.

### `EXPORT-13` [P1, M] Add render completion notifications and power management

- prevent system sleep during active local processing/render;
- restore normal power behavior on every success/error/cancel path;
- notify when unfocused;
- clicking the notification opens completed outputs.

### `EXPORT-14` [P2, L] Add project export history

Keep batch date, settings hash, outputs, failures, and manifest path so users can reopen, compare, or re-render a prior delivery.

## Phase 6: Restrained delight and release polish

### `DELIGHT-01` [P2, M] Add optional UI sound cues

- off/mute control in Settings and header utility menu;
- quiet cues for approve, reject, job ready, successful batch, warning, and failure;
- no sound on generic hover;
- no reuse of content-track SFX that could be mistaken for exported audio;
- best-effort playback that never blocks work.

### `DELIGHT-02` [P2, S] Add finite completion celebrations

Use a small one-shot accent burst for first successful export and optionally for a zero-failure batch.

No perpetual particles, no celebration on routine autosave, and no animation under reduced motion.

### `DELIGHT-03` [P1, M] Write one creator-focused voice system

Create copy rules and replace technical primary copy:

- `Pipeline status` becomes `Building your selects` where appropriate;
- `ready` becomes `Your selects are ready`;
- `batch done` becomes `Export pack ready`;
- technical stage names remain available in Details.

Copy stays direct, truthful, and specific.

### `DELIGHT-04` [P2, L] Add signed updates and What’s New

- check quietly on launch and periodically;
- non-blocking update banner;
- download/install progress and relaunch;
- show creator-facing release notes once after a real update, not on first install;
- reopen from Help;
- preserve project/job state across update restart.

### `DELIGHT-05` [P2, M] Add branded release surfaces

Audit app icon, About window, installer/DMG/NSIS art, first-launch screen, and crash/recovery dialogs so the experience does not stop at the webview boundary.

### `DELIGHT-06` [P2, S] Match skeletons to final geometry

Use exact poster/list/inspector/queue shapes and crossfade to real content without layout shift.

### `DELIGHT-07` [P3, L] Add honest local Studio Stats only if useful

Possible values: source hours processed, clips exported, render success rate, and time from source to first export.

Every metric needs a definition and local source. Do not add XP, ranks, streak pressure, or unverifiable “time saved” by default.

### `DELIGHT-08` [P3, XL] Add second-display preview only after master-detail succeeds

A separate clean preview window can show the active clip/full-screen output on another display.

Do not copy EZ Coder's 2/4/6 project tiling into Cliporous.

## Phase 7: Quality and release gate

### `QA-01` [P0, M] Build a deterministic renderer state showcase

Cover lobby, setup, processing stages, clips, inspector, cut plan, render queue, completion, recovery, settings, and all error states with real components and honest fixtures.

### `QA-02` [P0, M] Add keyboard end-to-end tests

Complete source selection alternative, project open/save, review triage, inspector edit, plan review, render start, cancel, retry, and output reveal without a pointer.

### `QA-03` [P0, M] Verify focus and overlay behavior

Test initial focus, focus trap, Escape, focus return, no obscured focus, nested popovers, notification routing, and command palette.

### `QA-04` [P0, M] Verify drag alternatives

Source import, template positioning, queue reorder, and any multi-select drag operation must have button/keyboard alternatives.

### `QA-05` [P0, M] Verify adaptive windows and text zoom

Test 900px practical minimum, intermediate widths, wide desktop, 200% UI zoom, long source names, long hooks, and settings labels.

### `QA-06` [P0, S] Verify themes and accessibility modes

Light, dark, reduced motion, forced colors/high contrast, visible focus, and measured text/icon/control contrast.

### `QA-07` [P1, L] Keep media-heavy screens responsive

- lazy-load below-viewport posters;
- limit simultaneous video decoders;
- play only the intended preview;
- virtualize very large project/clip/export lists when measurement proves necessary;
- reserve media dimensions;
- cancel stale thumbnails/previews.

### `QA-08` [P0, M] Stress state completeness

Loading, empty, no-results, offline, missing key, invalid key, missing media, low disk, setup error, retry, cancelling, canceled, partial success, full success, and destructive confirmation.

### `QA-09` [P0, M] Add privacy and redaction tests

Project files, recovery, logs, notifications, screenshots, errors, clipboard copy, and analytics labels must not expose credentials or unnecessary personal paths.

### `QA-10` [P1, M] Add cross-platform native checks

macOS and Windows window chrome, file association, menu shortcuts, dialogs, notifications, taskbar/dock progress, output reveal labels, paths, installer, and updater.

### `QA-11` [P0, M] Keep visual decisions content-authentic

For each broad review capture:

1. cover the logo and identify video editing from the screen alone;
2. remove one decorative effect;
3. verify every image/metric is real or clearly labeled fixture data;
4. confirm the signature survives narrow mode;
5. reject generic glass, ambient motion, emoji UI, terminal theater, and random metric cards.

### `QA-12` [P0, M] Release evidence gate

Before calling the broad UX work complete:

- desktop and practical-minimum screenshots;
- primary-flow keyboard proof;
- project save/reopen/recovery proof;
- secrets redaction proof;
- loading/error/retry/cancel/success proof;
- reduced-motion and high-contrast proof;
- measured media/render UI performance or explicit unverified status;
- `npm run check`, `npm run typecheck`, relevant tests, and build.

# Recommended delivery order

## Milestone 1: Safe desktop foundation

Complete `TRUST-01`, `TRUST-02`, `PROJ-01` through `PROJ-07`, `EDIT-01`, `EDIT-02`, `ERR-01`, `RUN-01`, `USAGE-01`, `SETUP-01`, `WIN-01`, and `WIN-02`.

**Outcome:** projects save normally, recover repeatedly, contain no credentials, reopen correctly, and cannot silently lose long-running work.

## Milestone 2: Creator lobby and shell

Complete `HOME-01` through `HOME-05`, `SHELL-01` through `SHELL-06`, `BRIEF-01`, and `SETTINGS-01`.

**Outcome:** the app feels like a creator studio before processing begins.

## Milestone 3: Transparent processing and fast review

Complete `PROCESS-01` through `PROCESS-08`, then `REVIEW-01` through `REVIEW-12`, `REVIEW-19`, and `REVIEW-20`.

**Outcome:** users understand the work and can review clips at keyboard speed with trustworthy previews.

## Milestone 4: Cut plan and brand intelligence

Complete `PLAN-01` through `PLAN-04`, `PROFILE-01`, `PROFILE-02`, and then the optional asset-library work.

**Outcome:** AI creative decisions become inspectable and correctable before expensive renders.

## Milestone 5: Durable export payoff

Complete `EXPORT-01` through `EXPORT-10` and `EXPORT-13`.

**Outcome:** render work survives interruption, reports fallbacks honestly, and ends in usable media plus social copy.

## Milestone 6: Delight and distribution

Complete updates, What’s New, optional sounds, finite celebration, branded installer surfaces, and the full QA gate.

**Outcome:** Cliporous gains EZ Coder's crafted feel without becoming a coding tool in brown clothing.

# The smallest high-impact release

If only one focused release is available, ship these twelve items:

1. strip secrets from project/recovery files;
2. fix recovery acknowledgement;
3. true Save/Save As plus atomic autosave;
4. wire undo/redo;
5. structured human errors and honest Cancelling state;
6. validated Connections cards;
7. searchable recent-project lobby with real posters;
8. processing activity feed with stage result summaries;
9. filters, keyboard triage, and auto-advance;
10. waveform plus real render preview in Clip Detail;
11. long-form Cut Plan review;
12. export preflight plus durable queue status.

That set delivers the strongest EZ Coder qualities: **personality, continuity, transparency, speed, and trust**, all expressed through content creation.