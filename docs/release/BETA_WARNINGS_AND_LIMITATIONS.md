# BatchClip 0.1.0 beta warnings and known limitations

## Read before installing

**Beta software:** use copies of important footage and projects. Crashes, incomplete exports, and workflow changes are possible.

**Unsigned builds:** BatchClip 0.1.0 has no verified publisher identity. Windows may show **Unknown publisher** or SmartScreen's **Windows protected your PC**. macOS may show an unidentified-developer or malware-check warning because the app is not signed or notarized.

Only use the operating system's documented override when the artifact came from the trusted BatchClip beta channel and its SHA-256 matches the checksum published with that exact artifact. An unsigned build provides no publisher verification, notarization scan, or signature-based tamper assurance.

**Not approved for distribution yet:** the repository redistribution audit currently blocks all installer and DMG packaging. Release materials may be reviewed, but builds must not be shared until [`npm run audit:third-party -- --release`](../../package.json) exits successfully and the [release checklist](../RELEASE_CHECKLIST.md) records approval.

## Platform limits

- Windows support is limited to Windows 10/11 on 64-bit Intel or AMD (`x64`) PCs; Windows on ARM is unsupported.
- macOS support is limited to Apple Silicon (M1 or newer) on macOS 11+; Intel Macs are unsupported.
- Linux is not part of the 0.1.0 beta test scope.
- First-run transcription setup downloads about 2–3 GB and needs at least 6 GB free on the system drive.

## Workflow limits

- Gemini analysis requires the tester's own API key, internet access, and available provider quota; provider charges may apply.
- Local transcription works best with clear speech. Silence, overlapping speakers, noise, uncommon names, and mixed languages can reduce accuracy.
- Short-form output is fixed at 1080 × 1920, 30 fps with one vertical edit style; custom resolution, frame rate, and style selection are unavailable.
- The 16:9 long-form path is early and has fewer proven workflows than vertical clips.
- Rendering can be slow and consume substantial CPU, GPU, memory, temporary disk space, and battery.
- Face-aware crops and AI edit choices require review; they may frame the wrong person or select an unsuitable moment.
- Online video import and optional stock B-roll depend on third-party availability, terms, and network behavior.
- AI-generated fal.ai imagery is unavailable in this build; exports fall back to Pexels stock footage or no B-roll.
- Active analysis and online downloads stop without internet; already-downloaded media, local review, and rendering can continue when their inputs are present.
- Recovery is best-effort. Save a `.batchclip` project and keep the original source at its existing path.

## Safe testing

Use non-sensitive footage that you own or have permission to process. Verify every caption, crop, cut, claim, and right before publishing an exported clip.
