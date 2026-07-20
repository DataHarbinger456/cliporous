# Promo Mode — Brand Pack

Promo Mode injects "evidence" pop-ups into talking-head shorts: animated Media
Master templates + real screenshots/recordings of the app and your Skool, plus a
forced Skool CTA on every clip's end. Templates ship built-in; **captures** and
the **CTA** come from a Brand Pack the user keeps on disk.

## Location

    {userData}/promo/brand-pack/
      manifest.json          ← active manifest (seeded on first promo render)
      manifest.example.json  ← full reference example
      README.md              ← runtime copy of these notes
      assets/                ← drop your screenshots / recordings here

On macOS `{userData}` is `~/Library/Application Support/batchcontent/`.
On Windows it is `%APPDATA%/batchcontent/`.

The folder + a seeded `manifest.json` are created automatically the first time a
Promo render runs (see `ensureBrandPackScaffold` in `brand-pack-loader.ts`).

## The one required asset

Save a screenshot of your Skool About page to:

    {userData}/promo/brand-pack/assets/skool-about.png

The seeded manifest already wires `skool-about` as the CTA (`ctaAssetId`), so the
moment that file exists the forced end-CTA renders. Without it, promo clips still
render (spoken-split + template pops) but with **no CTA** — the funnel's payoff.

## Manifest shape

```jsonc
{
  "ctaAssetId": "skool-about",           // must match a capture id
  "captures": [
    {
      "id": "skool-about",
      "category": "cta",                  // cta | app-ui | community-proof | growth-stat
      "mediaPath": "skool-about.png",     // relative to assets/, or absolute
      "display": "fullscreen",            // optional; per-category default otherwise
      "durationSeconds": 3.5,             // optional; default 2.5
      "tags": ["skool", "join"]           // optional; used for semantic pick
    }
  ]
}
```

## Category → on-screen treatment

| category         | treatment                        | typical asset                     |
|------------------|----------------------------------|-----------------------------------|
| `cta`            | fullscreen at clip end           | Skool About page                  |
| `app-ui`         | quick fullscreen flash           | Media Master screens/recordings   |
| `community-proof`| split-top (your face stays on)   | members grid, win/testimonial     |
| `growth-stat`    | animated stat overlay (templated)| none needed                       |

## Notes

- Images are auto-converted to short Ken Burns clips; `.mp4/.mov/.webm/.mkv/.m4v`
  pass through unchanged.
- **Missing files are skipped safely** — no crash — so you can wire manifest
  entries before every asset is captured.
- Do not commit real screenshots to the repo; they live in `{userData}`.
