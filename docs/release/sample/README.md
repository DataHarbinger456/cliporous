# Synthetic BatchClip demo

[`batchclip-0.1.0-synthetic-demo.mp4`](./batchclip-0.1.0-synthetic-demo.mp4) is a 12-second, side-by-side illustration of a 16:9 source becoming a captioned 9:16 clip.

## Provenance and scope

- Every frame is generated from solid colors, animated rectangles, and text by [`generate-demo.sh`](./generate-demo.sh).
- It contains no user footage, faces, voice, transcript, credentials, private URLs, third-party logos, or downloaded stock media.
- It is silent so it cannot be mistaken for transcription evidence.
- It demonstrates the intended input/output shape only. It was not rendered by the BatchClip application and is not end-to-end acceptance evidence.
- The design uses BatchClip's espresso, cream, and violet brand colors.

## Rebuild

From the repository root on macOS:

```bash
docs/release/sample/generate-demo.sh
```

The script uses the repository's installed `ffmpeg-static` executable and macOS Arial by default. Override either path when needed:

```bash
FFMPEG_BIN=/path/to/ffmpeg FONT_FILE=/path/to/font.ttf \
  docs/release/sample/generate-demo.sh /path/to/output.mp4
```

Do not package or redistribute the repository's FFmpeg executable with this demo. The app release remains blocked until the third-party redistribution gate passes.
