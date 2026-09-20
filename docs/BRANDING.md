# Branding

## Source of truth

Colours below are sampled directly from the official PMI UAE Chapter logo SVGs supplied by the
Chapter (`PMI UAE Chapter Logo/united arab emirates khaleeji chapter horizontal logo/digital/`),
not guessed or approximated.

> Sample AGM slides were mentioned but had not been supplied when this was built. Every colour
> lives in [`src/styles/tokens.css`](../src/styles/tokens.css) — aligning the app to the final
> deck is a one-file edit, no component changes.

## Palette

| Token | Hex | Source | Used for |
|---|---|---|---|
| `--pmi-purple` | `#4F17A8` | Logo, primary | Screen background, primary buttons, answer A |
| `--pmi-cyan` | `#05BFE0` | Logo, secondary | Accents, timer ring, answer B |
| `--pmi-orange` | `#FF610F` | Logo, secondary | Highlights, CTAs, answer C |
| `--pmi-green` | `#00A878` | Complement | Answer D, correct-answer state |
| `--pmi-purple-deep` | `#2E0D63` | Derived | Gradient base on the big screen |
| `--pmi-ink` | `#14093A` | Derived | Body text on light backgrounds |
| `--pmi-cloud` | `#F6F4FB` | Derived | Light surface |

`--pmi-green` is the only colour not drawn from the logo. Four answer tiles need four
distinguishable colours, and the three brand colours alone cannot do that accessibly. It was
chosen to sit naturally beside the PMI palette and to pass contrast on white.

## Logo variant rules

Three horizontal variants are bundled in `public/logos/`. The rule is mechanical:

| Background | Variant | File |
|---|---|---|
| PMI purple / any dark colour | **White** | `pmi-uae-horizontal-white.svg` |
| White / light neutral | **Full colour** | `pmi-uae-horizontal-color.svg` |
| Greyscale, print, single-colour | **Black** | `pmi-uae-horizontal-black.svg` |

Square logo marks (`pmi-uae-mark-*.svg`) are used for the favicon and tight corners where the
horizontal lockup would be illegible.

Applied in this app:

- `/screen` — deep purple gradient → **white** logo
- `/` (player) — white background → **full colour** logo
- `/host`, `/admin` — light interface → **full colour** logo

**Never** recolour, stretch, rotate or add effects to the logo. Clear space on all sides is at
minimum the height of the "PMI" wordmark.

## Typography

System font stack — no webfont. This is deliberate: on a congested venue network, a 200 KB
webfont download is a real risk of a blank screen at exactly the wrong moment.

```css
font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial,
             sans-serif;
```

## Accessibility

Colour alone never carries meaning. Each answer tile pairs its colour with a distinct **shape**
(▲ triangle, ◆ diamond, ● circle, ■ square) and its letter, so colour-blind delegates and
anyone at the back of a 1,000-seat hall can still match their phone to the screen.

- Body text meets WCAG AA (4.5:1); large display text meets AA (3:1).
- Big-screen type is sized for readability at ~40 m viewing distance.
- Full keyboard navigation; visible focus rings throughout.
- `prefers-reduced-motion` is respected — confetti, the prize spinner and all transitions
  degrade to instant state changes.
