# BatchClip landing page design

## Design read

- **Surface:** Marketing page for a desktop creative application.
- **Audience:** Video creators, podcasters, and social teams who already have long-form footage and need a faster short-form workflow.
- **Single job:** Explain the source, shape, and export workflow clearly enough that a visitor wants the desktop app.
- **Task and risk:** Product evaluation is occasional and low-risk. Trust is still important because the product processes local media, uses AI scoring, and produces publishable output.
- **Content:** One product claim, an honest current app screenshot, six ordered workflow capabilities, a real rendered example, three current workflow screens, release availability, and factual FAQs.
- **Platform:** Static responsive web page for current desktop and mobile browsers. Keyboard, pointer, touch, reduced-motion, and forced-color users are supported.
- **Constraints:** Preserve the EZ Coder landing page's single-scroll structure and dark product-demo treatment. Use BatchClip's espresso, cream, and violet dark-theme seeds, Inter typography, actual app screenshots, and the Source → Shape → Export product model.

## Evidence

### Local product evidence

- `../ezcoder/website/` supplies the requested layout reference: sticky navigation, centered hero, product frame, feature sequence, screenshot gallery, release area, FAQ, and footer.
- `src/renderer/src/components/StudioHeader.tsx` supplies the BatchClip wordmark, clapperboard symbol, and Source → Shape → Export progression.
- `src/renderer/src/assets/index.css` and the project context supply the espresso, cream, and `#9f75ff` violet theme seeds.
- `.ezcoder/screenshots/` supplies current product states. No testimonial, logo strip, customer metric, or performance claim was invented.
- `showreel-delos.mp4` and the existing output screenshot supply the real rendered example.

### Archetype evidence

- **Marketing and brand leads.** The page has one claim and one conversion target, with product media as proof.
- **Apple is aligned** because the product evidence is allowed to carry the explanation instead of adding dense decorative UI.
- **Sanity is aligned** because technical product capability stays concrete and inspectable.
- **Figma is the contrast** because BatchClip needs a direct linear workflow, not an expressive multi-audience composition.

## Thesis

Keep the requested EZ Coder page skeleton, then make every distinctive detail belong to video editing. The first glance is the BatchClip wordmark and one-line outcome. The second is the real review workspace. The action is Get BatchClip, with release availability stated honestly. A film-production signature appears through the clapperboard mark, filmstrip-like rules, the three-stage rail, a portrait output player, and current product screens.

### Semantic tokens

- **Canvas:** espresso `#140806`
- **Raised surfaces:** `#1e0e0b`, `#291510`, and `#341c15`
- **Primary text:** cream `#fff8ec`
- **Secondary text:** `#e7d8c6`
- **Muted text:** `#bfae9d`
- **Primary action/focus:** violet `#a77cff` to `#d2bbff`
- **Success:** green `#5ed29a`, always paired with text
- **Geometry:** 1120px shared container, 16px major radius, 12px disclosure radius, 44px primary control minimum
- **Motion:** 160ms productive color, border, and shadow feedback with no generic lift; reduced motion collapses transitions

## Reuse map

- The overall section order and static HTML/CSS/JS approach follow `../ezcoder/website`.
- The brand icon uses the same Lucide Clapperboard geometry as the app.
- Inter is self-hosted from `resources/fonts/`.
- Screens and output media are copied from existing project evidence.
- The lightbox uses a native `<dialog>` instead of recreating modal semantics.

## Anti-default decisions

- **Centered hero:** This belongs because the inherited page has one product, one promise, and one next action.
- **Dark media canvas:** This belongs because BatchClip has an explicit espresso dark mode and video previews benefit from a low-glare surround.
- **Product screenshot below the claim:** This belongs because it is a current readable review state that directly proves the approve-or-reject workflow.
- **Six equal cards:** This belongs because they are ordered stages in one pipeline, not interchangeable feature filler.
- **Status pill:** This belongs because it communicates platform availability in one compact role; pills are not used as the general component shape.
- **No invented proof:** Customer logos, testimonials, ratings, user counts, and speed claims are omitted.

## Components and states

- Navigation links, the primary CTA, and both platform downloads have hover, focus-visible, and press feedback.
- Both available releases use native download links; the Windows card states the unsigned-installer warning nearby.
- FAQ uses native `<details>` and `<summary>` keyboard behavior.
- Gallery items are native buttons with accessible names.
- Lightbox uses native `<dialog>`, labelled caption, Escape close, arrow navigation, close control, backdrop close, and focus return.
- Video uses native controls, muted initial state, no autoplay, poster fallback, and inline playback.
- Missing JavaScript leaves all marketing content, video, FAQ, and release status available; only gallery items are injected by script.

## Responsive behavior

- Desktop uses a 3-column workflow grid, 2-column gallery, and split output story.
- Tablet moves the workflow to 2 columns and narrows the output player.
- Mobile uses one column, full-width hero actions, a compact 3-stage rail, one-column gallery, and a centered portrait output.
- The minimum supported viewport is 320 CSS pixels. Content regions avoid fixed heights.

## Critique and revision

The first desktop and 390px renders scored **21/24**. The weakest criterion was the accessibility floor because the original interactive borders measured below 3:1 against their adjacent surfaces. The secondary amber background glow was also decorative rather than product-specific.

The revision removed that glow and raised the interactive border token to `#875d4e`, which measures 3.30:1 against the raised surface and 3.47:1 against the canvas. Gallery buttons, ghost buttons, FAQ disclosures, and lightbox controls now use that boundary. The 320px recapture preserved the primary action, stage order, output player, gallery, release state, and FAQ without clipping.

## Final quality score

**23/24**

1. Brief specificity: 2
2. Information hierarchy: 2
3. Composition: 2
4. Consistency and flow: 2
5. Typography: 2
6. Material and surface logic: 2
7. State completeness: 2
8. Responsive behavior: 2
9. Accessibility quality floor: 1 (semantic and contrast checks pass; automated assistive-technology coverage remains unverified)
10. Motion purpose: 2
11. Content authenticity: 2
12. Visual distinctiveness: 2

## Production checks

- **Desktop render passed:** `.ezcoder/screenshots/landing-desktop-final.png` at 1440×1000.
- **Narrow render passed:** `.ezcoder/screenshots/landing-mobile-final.png` at 320×720.
- **Dialog render passed:** `.ezcoder/screenshots/landing-lightbox-final.png` confirms visible controls, caption, and unobscured close action.
- **Semantics passed by source audit:** one H1, unique IDs, valid in-page anchors, alt text on static images, native button/details/dialog/video controls, and no missing local assets.
- **Keyboard/focus partially verified:** native control order, visible focus CSS, dialog Escape behavior, initial close focus, and trigger focus return are implemented. Full assistive-technology traversal is unverified.
- **Contrast passed for text:** muted text is 8.69:1 on the raised surface and dim text is 5.47:1. Interactive boundaries use the 3.30:1 border token or the higher-contrast violet focus ring.
- **320px reflow passed.** A separate 200% browser text-zoom run is unverified.
- **Reduced motion and forced colors passed source review.** Dedicated rendered captures are unverified.
- **Static checks passed:** JavaScript syntax, duplicate IDs, anchors, local assets, media dimensions, disallowed em dashes, and unnamed CSS transitions.
- **Media verified:** the example output is 1080×1920, 30 fps, and 62 seconds.
- **Performance unverified:** no field Core Web Vitals exist yet. The likely LCP image is eager with fixed dimensions; below-fold gallery images are lazy; fonts use `font-display: swap`; video does not autoplay.
- **Deployment passed:** Vercel production alias is `https://landing-phi-dun.vercel.app`.
- **Downloads ready:** the 275 MB Apple Silicon DMG and 217 MB Windows x64 EXE are published through the public GitHub release linked from their platform cards.
- **Artifacts verified:** BatchClip 0.1.1 SHA-256 is `1cbed9389808738a21d59b1535113b4c84f1eef0b1ebbf897494d14ccde17194` for macOS and `3f3e44def75b89a0ee3e2a1219e9037753b5ffe8104397406ff53ed9546590fe` for Windows.
- **Browser policy:** current Chromium, Safari, and Firefox releases with native `<dialog>` support.
