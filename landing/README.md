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

The Apple Silicon DMG and Windows x64 EXE are hosted in the public `batchclip-downloads` Vercel Blob store and linked from `index.html`. The Windows 0.1.0 installer is 178,488,699 bytes with SHA-256 `ea9e59134ccc85aff2af1e63bd6dcd6588c31b046808ac93074e8e53c92ec638`.

Deploy updates with:

```bash
vercel deploy --prod --yes --cwd landing
```
