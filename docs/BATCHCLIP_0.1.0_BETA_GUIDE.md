# BatchClip 0.1.0 beta guide

BatchClip turns a long video into scored, captioned clips. Version 0.1.0 is beta software and is distributed as an unsigned test build.

## Before you install

| Platform | Requirement |
| --- | --- |
| Windows | Windows 10 or 11 on a 64-bit Intel or AMD PC (`x64`). Windows on ARM is not supported. |
| macOS | Apple Silicon Mac (M1 or newer) with macOS 11 or newer. Intel Macs are not supported. Python 3.10 or newer is required for local transcription; setup can use an existing Homebrew installation to install Python 3.12 if needed. |
| Both | A stable internet connection and at least **6 GB free on the system drive** before first setup. Keep additional space available for source videos and exports. |

Internet access is required for first-run setup and Gemini analysis. Features that fetch online video or B-roll also need internet access. Local review and rendering can continue without internet after the required analysis and downloads are complete.

## Install on Windows 10/11

Use the `BatchClip-0.1.0-win-x64.exe` installer supplied by the BatchClip beta team.

This beta installer is not code-signed, so Windows SmartScreen may block it. Only continue if the file came from the trusted beta download:

1. Open the installer.
2. On **Windows protected your PC**, select **More info**.
3. Confirm the app name is **BatchClip** and the publisher is shown as unknown.
4. Select **Run anyway**, then follow the installer.

BatchClip installs for your Windows account and should not require administrator access.

## Install on macOS

Use the `BatchClip-0.1.0-mac-arm64.dmg` supplied by the BatchClip beta team.

1. Open the DMG and drag **BatchClip** into **Applications**.
2. Try to open BatchClip once. macOS may block it because this beta is not signed or notarized.
3. Open **System Settings → Privacy & Security**.
4. Scroll to **Security**, find the message about BatchClip, and select **Open Anyway**.
5. Approve with your password or Touch ID, then select **Open**.

Only use **Open Anyway** for a BatchClip file received from the trusted beta download.

## First-run setup

On first launch, BatchClip installs its local transcription tools and speech model.

- The download is approximately **2–3 GB**.
- Setup requires at least **6 GB of free space** for downloads, installation, and working files.
- Keep BatchClip open and keep the computer connected to the internet until setup finishes.
- Download time depends on connection speed. Package installation and model verification can pause the progress display for several minutes.
- If setup is interrupted, reopen BatchClip and retry it from the setup screen.

The speech model remains on the computer, so it is not downloaded for every video.

## Set up a Gemini API key

A Gemini API key is required for AI clip scoring, hooks, descriptions, and cut plans.

1. Sign in to [Google AI Studio](https://aistudio.google.com/apikey) and create a Gemini API key.
2. In BatchClip, open **Settings → Connections**.
3. Paste the key into **Gemini**.
4. Select **Test connection**.
5. After the test passes, select **Save settings**.

Gemini usage is tied to the Google account that owns the key and may be subject to Google's quotas or charges. Never send the key in a support report or screenshot.

## Privacy and API behavior

- **Stays on the computer:** source video processing, speech transcription, face detection, project files, editing, and final rendering run locally.
- **Sent to Gemini:** transcript text and relevant analysis instructions, such as target audience, are sent directly to the Gemini API for scoring and AI-assisted text or cut plans. The source video itself is not uploaded to Gemini during standard clip analysis.
- **API provider rules:** data sent to Gemini is handled under Google's Gemini API terms and data-use policies. Optional online sources such as YouTube or Pexels contact those services only when their features are used.
- **Key storage:** API keys are encrypted through the operating system's secure storage. They are not included in `.batchclip` project files or recovery snapshots.

## Uninstall

### Windows

1. Quit BatchClip.
2. Open **Settings → Apps → Installed apps** (called **Apps & features** on some Windows 10 versions).
3. Find **BatchClip**, select its menu, and choose **Uninstall**.

### macOS

1. Quit BatchClip.
2. Open **Applications** in Finder.
3. Move **BatchClip** to the Trash, then empty the Trash when ready.

Uninstalling does not delete source videos, rendered clips, or `.batchclip` project files. Beta settings, caches, and the downloaded transcription model may remain in the user profile; contact support if you need help removing all local BatchClip data.

## Known issues and limits

- Windows and macOS show security warnings because the 0.1.0 beta builds are unsigned. Follow the steps above only for a trusted download.
- First-run setup is large and may appear idle while packages install or the model is verified.
- AI analysis stops when the internet is unavailable or the Gemini key reaches its quota; existing local media and project work remain available.
- Video rendering can be slow and use substantial CPU, GPU, and disk space, especially for long or high-resolution sources.
- Vertical exports are fixed at 1080 × 1920 and 30 fps in this release.
- Windows on ARM, Intel Macs, and macOS versions older than 11 are not supported.

## Changelog

### 0.1.0

- Initial Windows x64 and macOS Apple Silicon beta release.
- Added local transcription, AI clip scoring, clip review, and project save/recovery.
- Added 9:16 exports with face-aware cropping, burned-in captions, titles, transitions, and optional B-roll.
- Added an early 16:9 long-form editing path.
- Added encrypted API-key storage and credential-free project files.

## Support

Report a beta problem through [BatchClip support on GitHub](https://github.com/Gahroot/cliporous/issues). Include the operating system version, what you were doing, the exact error message, and a screenshot if useful—never include an API key, private transcript, or source video.
