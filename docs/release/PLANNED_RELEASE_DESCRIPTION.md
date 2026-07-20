# BatchClip 0.1.0 beta

> **PLANNED — DO NOT PUBLISH YET.** Installer distribution remains blocked by unresolved third-party redistribution requirements. Publish this description only after the [release checklist](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/RELEASE_CHECKLIST.md) records a passing release audit, acceptance results, and final artifact checksums.

BatchClip turns spoken long-form footage into AI-scored, captioned clips while transcription, face detection, editing, and rendering stay on your computer.

## See it

Watch the **[12-second synthetic input/output demo](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/release/sample/batchclip-0.1.0-synthetic-demo.mp4)**. It is an illustrative generated sample—not an end-to-end acceptance result—and contains no user media or credentials.

## Highlights

- Local transcription and face-aware framing.
- Gemini-assisted moment scoring, hooks, and edit plans.
- Approve/reject review before export.
- Captioned 1080 × 1920, 30 fps vertical MP4 output.
- Early 1920 × 1080, 30 fps long-form path.
- Local projects, recovery, and operating-system-encrypted API-key storage.

Read the concise [release notes](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/release/RELEASE_NOTES.md), then follow the [60-second getting-started guide](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/release/GETTING_STARTED_60_SECONDS.md).

## Beta and unsigned-build warning

This is early beta software. Keep backups and verify every caption, crop, and cut. The Windows and macOS builds are unsigned; the operating system will show an unknown-publisher or unidentified-developer warning. Continue only when the file came from the trusted BatchClip beta channel and its SHA-256 matches the checksum published for that exact file.

Unsigned builds do not provide verified publisher identity, notarization malware scanning, or signature-based tamper assurance. Read all [warnings, platform requirements, and known limitations](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/release/BETA_WARNINGS_AND_LIMITATIONS.md) before installing.

## Planned artifacts

| Platform | Planned file | SHA-256 |
| --- | --- | --- |
| Windows 10/11 x64 | `BatchClip-0.1.0-win-x64.exe` | Not available—release blocked |
| Apple Silicon macOS 11+ | `BatchClip-0.1.0-mac-arm64.dmg` | Not available—release blocked |

Replace each blocked status with the checksum produced from the final approved artifact before publishing. Windows on ARM, Intel Macs, and Linux are outside this beta's supported test scope.

## Privacy

Video processing and rendering run locally. Transcript text and relevant instructions are sent to Gemini for AI features; optional YouTube import and Pexels B-roll contact those providers only when used. API keys are stored through the operating system's secure storage and are excluded from current project files. Read the full [privacy summary](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/release/PRIVACY.md).

## Feedback

Report problems with the [safe bug-report template](https://github.com/Gahroot/cliporous/blob/v0.1.0/docs/release/BUG_REPORT_TEMPLATE.md). Never attach API keys, private transcripts, user footage, exports, or unreviewed project/log files.
