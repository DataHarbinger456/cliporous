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

The Apple Silicon DMG and Windows x64 EXE are published on the public GitHub release linked from `index.html`. BatchClip 0.1.1 checksums: macOS DMG `1cbed9389808738a21d59b1535113b4c84f1eef0b1ebbf897494d14ccde17194`; Windows EXE `3f3e44def75b89a0ee3e2a1219e9037753b5ffe8104397406ff53ed9546590fe`.

Deploy updates with:

```bash
vercel deploy --prod --yes --cwd landing
```
