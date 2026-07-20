# QA-01 through QA-12 release evidence

## Outcome

The renderer now has a deterministic `#qa` showcase with 19 content-authentic states, native Chromium zoom, complete drag alternatives, media-decoder limits, accessibility-mode proofs, privacy checks, and cross-platform desktop contracts.

Open the index from a production renderer build at `#qa`. Direct examples:

- `#qa/lobby`
- `#qa/processing-cancelling`
- `#qa/inspector`
- `#qa/partial-success`
- `#qa/recovery`
- `#qa/settings`
- `#qa/errors`

The showcase uses a fixed local project, fixed timestamps, neutral waveform/contact-sheet media, fixture-only paths, and visible fixture labeling. It never reads user files or credentials.

## QA matrix

| Item | Evidence | Result |
| --- | --- | --- |
| QA-01 deterministic states | `src/renderer/src/qa/fixtures.ts`, `api.ts`, `QaRendererShowcase.tsx`; 19 hash states cover lobby, setup, processing, review, inspector, Cut Plan, render queue, recovery, settings, completion, cancellation, and errors | Pass |
| QA-02 keyboard flow | Drop URL plus Enter, global open/save shortcuts, review triage/undo/render confirmation, inspector edit, Cut Plan acceptance, render cancel/retry/reveal in the 302-test renderer suite | Pass |
| QA-03 focus and overlays | `CommandPaletteFocus.test.tsx` proves initial focus, Escape, and focus return; Radix recovery/confirmation tests prove containment and destructive confirmation; notification routing tests pass | Pass |
| QA-04 drag alternatives | Import has Choose/URL paths; Template Editor has arrows, Shift+arrows, numeric X/Y, buttons, Reset, and live announcements; queue rows have earlier/later buttons; multi-select uses native checkboxes and keyboard range selection | Pass |
| QA-05 adaptive windows and zoom | Main minimum is 900×640; Settings minimum is 400×480; `webFrame.setZoomFactor()` provides reflowing 50–200% native zoom; long fixture names/hooks and high-zoom header composition are captured | Pass |
| QA-06 themes and access modes | Light and espresso dark captures; measured theme contrast floor 5.61:1; reduced-motion and forced-color CSS plus deterministic high-contrast capture; visible focus on recovery | Pass |
| QA-07 media responsiveness | Posters reserve aspect ratios and defer below the first row; clip preview video mounts only after hover/focus; completed outputs use `preload="none"`; one completed output plays at a time; media cards use `content-visibility: auto` | Pass, with field performance limitation below |
| QA-08 state completeness | Showcase includes loading, empty, no results, offline, missing/invalid key, missing media, low disk, setup error, retry, cancelling, canceled, partial success, full success, and destructive recovery confirmation | Pass |
| QA-09 privacy and redaction | Project/recovery serializer tests, structured error tests, diagnostics-copy tests, and showcase DOM tests remove credential values and macOS/Windows home folders | Pass |
| QA-10 native contracts | macOS/Windows menu shortcuts, persisted window bounds, hidden-inset traffic lights, file association, installer targets, updater metadata, notifications/progress hooks, and platform reveal labels are tested | Pass |
| QA-11 authenticity | Every fixture surface says it is local QA data; the poster contains `LOCAL QA FIXTURE`; paths use `/QA-Fixtures`; no customer proof, stock people, terminal theater, emoji UI, glass, or random metrics | Pass |
| QA-12 release gate | Desktop/minimum/zoom/theme/access/error/cancel/recovery/platform captures plus keyboard, persistence, privacy, performance, focused native tests, renderer suite, build, and honest repository baseline below | Pass for QA scope; repository baseline remains red |

## Final captures

- Desktop master-detail inspector, 1440×960: `.ezcoder/screenshots/qa-inspector-desktop-evidence.png`
- Practical main-window minimum, 900×800: `.ezcoder/screenshots/qa-clips-practical-minimum-evidence.png`
- Effective 450 CSS-pixel viewport for a 900px window at native 200% zoom: `.ezcoder/screenshots/qa-lobby-native-200-percent-evidence.png`
- Settings minimum, 400×640: `.ezcoder/screenshots/qa-settings-minimum-400.png`
- Dark processing state, 1440×900: `.ezcoder/screenshots/qa-processing-dark-theme-evidence.png`
- Reduced motion plus deterministic high contrast, 900×900: `.ezcoder/screenshots/qa-errors-reduced-motion-high-contrast.png`
- Honest processing cancellation, 900×800: `.ezcoder/screenshots/qa-processing-cancelling-evidence.png`
- Low-disk partial success and retry, 900×800: `.ezcoder/screenshots/qa-partial-success-evidence.png`
- Recovery with visible initial focus, 900×800: `.ezcoder/screenshots/qa-recovery-evidence.png`
- macOS completion copy: `.ezcoder/screenshots/qa-completion-macos-evidence.png`
- Windows completion copy: `.ezcoder/screenshots/qa-completion-windows-native-copy.png`

The first capture cycle exposed clipped high-zoom header utilities and cramped four-column output actions. The revision moved low-frequency high-zoom actions into More, constrained the shell to the viewport, retained Jobs plus More, switched output actions to a stable two-column grid, and recaptured the affected states. Template Editor's generic silhouette was also removed when real project media is available.

## Keyboard, focus, and recovery proof

The full renderer suite passes **302/302** tests across 60 files. Relevant flow proofs include:

- `DropScreen.test.tsx`: source choice alternative, URL paste plus Enter, setup and missing-key recovery, project opening.
- `useKeyboardShortcuts.test.tsx`: New/Open/Save/Save As, command palette, undo/redo, and typing safeguards.
- `ClipGrid.test.tsx`: Arrow/J/K movement, A/X/U triage, Space playback, Enter editor, Cmd/Ctrl+Z, render confirmation, auto-advance, bulk keyboard range selection, no-results, and wide/narrow recomposition.
- `CommandPaletteFocus.test.tsx`: search receives initial focus; Escape closes; focus returns to the invoking control.
- `TemplateEditor.test.tsx`: button, numeric, Arrow, and Shift+Arrow alternatives plus current-source media.
- `CutPlanReviewScreen.test.tsx`: plan evidence and acceptance before export.
- `ProcessingScreen.test.tsx` and `RenderScreen.test.tsx`: honest Cancelling state, retained work, failed-cancel retry, partial success, retry, and output reveal.
- `RecoveryPrompt.test.tsx`: snapshot-scoped recovery, destructive confirmation, failed restore/discard preservation, and refreshed crash protection.
- `project-service.test.ts`: Save/Save As/autosave/reopen/recovery serialization and scope preservation.

## Privacy proof

Focused main-process QA passes **33/33** tests across eight files, including credential stripping, structured error redaction, project IPC, app menus, window state, and file integration.

The deterministic diagnostics test opens every Details disclosure and verifies that the DOM contains `[REDACTED]` while containing neither a fixture credential value nor `/Users/<name>` or `C:\Users\<name>` home paths. Explicit Copy path remains available only as a user-invoked output action because that path is the requested clipboard content.

## Performance evidence

Local jsdom lab measurement on this machine:

- 120 real `ClipCard` components mounted in **188.8 ms** during the full renderer run.
- Initial card mount allocated **0 video elements**.
- 112 below-first-row posters used lazy loading.
- A hover/focus creates one preview video and removes it when intent ends.
- Completed output videos use `preload="none"`, and starting one pauses the previous output.
- Production renderer build succeeds; renderer JS is 2,664.39 kB before transport compression and CSS is 107.39 kB.

**Unverified field item:** there is no packaged-device trace for GPU memory, dropped frames, INP, or poster decode time on a large real project. The exact next measurement is a macOS and Windows packaged run with 120 real posters, 20 completed outputs, Chromium Performance recording, and decoder/GPU counters. Virtualization remains intentionally deferred until that measurement shows the paint-contained list is insufficient.

## Theme contrast measurements

`ui-release-contract.test.ts` computes WCAG relative luminance from the shipped HSL tokens. Measured text-pair ratios:

- Light foreground/background: 14.35:1
- Light muted/background: 5.71:1
- Light primary/white: 8.02:1
- Dark foreground/background: 15.58:1
- Dark muted/background: 9.79:1
- Dark primary/background: 5.61:1

The minimum measured pair is 5.61:1, above the 4.5:1 normal-text floor.

## Native support matrix

| Target | Window/input contract | Verified evidence |
| --- | --- | --- |
| macOS | 900×640 main minimum, hidden-inset titlebar, traffic-light inset, Command shortcuts, Finder terminology, Dock progress/notifications hooks | Source contract tests, menu tests, window-state tests, macOS completion capture |
| Windows | 900×640 main minimum, native frame, Ctrl shortcuts including Ctrl+Y redo, Explorer terminology, taskbar progress/notifications hooks, NSIS target, `.batchclip` association | Source contract tests, menu tests, package metadata tests, Windows completion capture |
| Settings window | 400×480 minimum, resizable/maximizable, keyboard tabs/forms, scroll-contained Save footer | Settings tests and 400px capture |
| Inputs | Keyboard and pointer; drag always optional; no-hover path; 50–200% native page zoom | Renderer flow tests, drag-alternative test, zoom test and capture |

Actual Windows titlebar and installer pixels are not emulated by the renderer capture. Their behavior is verified through Electron configuration, platform-specific menu/window tests, checked installer assets, and Windows-specific renderer copy.

## Verification commands

Passed:

- Targeted Biome check for the 21 QA implementation/test files.
- `npm run test:renderer`: **60 files, 302 tests passed**.
- Focused main QA: **8 files, 33 tests passed**.
- `npm run build`: passed after the final UI revision.

Run and recorded, but blocked by the existing broad dirty-tree baseline:

- `npm run check`: 671 errors, 70 warnings, and 174 infos across 495 files. Targeted QA files pass.
- `npm run typecheck`: 1,193 existing diagnostics. Filtered output has no direct QA implementation error; the remaining preload mention is the existing cross-project `TS6307` test-import configuration.
- `npm test`: main suite reaches **376/379**. Two existing long-form tests reference an undefined `REDACTED` fixture, and one existing Rehook expectation conflicts with the current override behavior. The independent renderer suite passes 302/302.

## Rendered quality rubric

Final score: **23/24**.

- Brief specificity 2: every capture reads as source-to-clips video editing without the logo.
- Information hierarchy 2: source/stage/next action remain first; diagnostics stay secondary.
- Composition 2: shared shell, toolbar, cards, and queue align at desktop, 900px, 400px Settings, and effective 450px high zoom.
- Consistency and flow 2: shared primitives, Lucide icons, labels, and action order persist.
- Typography 2: self-hosted Inter, stable roles, long fixture strings, and readable utility text.
- Material logic 2: borders separate work surfaces; real media owns contrast; no generic hover lift.
- State completeness 2: loading through destructive recovery and partial success are directly rendered.
- Responsive behavior 2: layouts recompose at supported minimums and native 200% zoom.
- Accessibility 2: keyboard completion, focus return, visible focus, labels/status, drag alternatives, measured contrast, reduced motion, and forced-color behavior are tested.
- Motion 2: named finite properties with an immediate reduced-motion path.
- Content authenticity 2: all images, paths, timestamps, counts, and metrics are fixed local fixtures and visibly labeled.
- Visual distinctiveness 1: the contact sheet, source time, waveform, stage rail, and cut-room language are specific, while neutral fixture repetition intentionally limits visual variety.
