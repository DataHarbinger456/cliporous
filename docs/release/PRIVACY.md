# BatchClip 0.1.0 beta privacy summary

## Data boundary

| Data or action | Where it goes |
| --- | --- |
| Source-video decoding, transcription, face detection, preview, editing, and final rendering | Runs locally on the computer. |
| Transcript text, target audience, and relevant analysis instructions | Sent directly to Google's Gemini API when AI scoring or writing features run. Standard clip analysis does not upload the source video to Gemini. |
| YouTube import | Contacts YouTube and download services only when the tester provides a YouTube URL. |
| Pexels stock B-roll | Sends search requests to Pexels only when that optional feature is used. |
| Project and recovery files | Stored locally. Current version 2 `.batchclip` files and recovery snapshots contain project settings, not API credentials. |
| API keys | Encrypted through Electron `safeStorage`, backed by the operating system's secure storage. |

Provider requests are governed by each provider's terms, retention rules, data-use policy, quotas, and possible charges. Do not process confidential, regulated, or third-party footage in this beta unless its owner has approved both local processing and the transcript data sent to Gemini.

## Safe sharing and support

Before sharing a project, screenshot, log, or bug report:

- Remove API keys, tokens, cookies, private URLs, email addresses, and account details.
- Replace private transcript excerpts and filenames with a short neutral description.
- Do not attach source footage, exported clips, or `.batchclip` files unless support explicitly requests them and you have permission.
- Review logs before attaching them; prefer the smallest excerpt around the failure.
- Use the [synthetic demo](./sample/README.md) when an example attachment is needed.

Legacy project files may contain embedded credentials. Open **Settings → Advanced → Legacy project privacy → Clean project…** to create a separate `.clean.batchclip` copy; BatchClip leaves the original unchanged.
