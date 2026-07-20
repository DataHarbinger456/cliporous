# BatchClip landing page

Static, dependency-free landing page adapted from the local `ezcoder/website` project.

## Preview

```bash
python3 -m http.server 4173 --directory landing
```

Open <http://localhost:4173>.

## Files

- `index.html`: page structure, product copy, metadata, and accessible dialog shell
- `styles.css`: BatchClip tokens, layout, responsive behavior, and interaction states
- `main.js`: screenshot gallery and native-dialog lightbox
- `assets/screens/`: current BatchClip screenshots and a rendered output poster
- `assets/showreel.mp4`: example BatchClip output
- `DESIGN.md`: design rationale and verification record

## Deployment

Production: <https://landing-phi-dun.vercel.app>

The Apple Silicon DMG is hosted in the public `batchclip-downloads` Vercel Blob store and linked from `index.html`. The Windows control remains disabled until an EXE installer is published.

Deploy updates with:

```bash
vercel deploy --prod --yes --cwd landing
```
