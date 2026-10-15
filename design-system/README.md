# Super Cub

> **Versi awal, tidak dipakai.** Acuan tampilan final adalah `mockup/index.html` (lihat `REQUIREMENTS.md` §6.9). Folder ini dibuat sebelum card, tombol, dan elemen lain dibuat translucent, jadi nilainya sudah tidak sama dengan mockup.

A bright, airy interface style taken from a Super Cub fan-poster UI: white cards floating over a sky-teal ground, one loud orange for anything you can press or measure, and a deep navy for media and secondary actions. It feels like a sunny morning commute: light, unhurried, a little playful.

The reference is an illustrated poster, so this system captures its UI layer only. The character art, the scooter and the artist's mark are not part of it.

## Content fundamentals

- **Titles are names.** Card titles are proper nouns in Title Case: "Mahou No Kaze", "Super Cub 50", "Arai Classic Mod Pilot White". No verbs, no punctuation.
- **Labels whisper.** Control labels and placeholders are lowercase and wide-tracked (`label-tracked`): "search", "write here". Tiny navy buttons use spaced capitals (`micro-caps`): "MORE".
- **Meta is explicit.** Field labels spell out the unit and end with a colon: "Price (dollar/$) :".
- **Numbers.** Prices use comma decimals, dot thousands and the currency after the figure: `1.403,04 $`, `298,31 $`. Durations are `m:ss` (`4:23`) in `numeric` with tabular figures.
- **Body copy** is plain and short, two to five sentences in a card, sentence case.

## Visual foundations

**Ground.** The page is `teal`. A lighter `teal-mist` may sweep across the lower part of a screen as one big curved field. Giant ghost letterforms of the page subject (for example "CUB") sit behind everything in `teal-deep`, cropped by the screen edges, and a few thin `+` sparkles in `teal-deep` or `surface` float in the gaps. Both are decoration only.

**Cards float.** Content lives on `surface` cards with `radius-lg`, `space-5` padding, no border and no shadow. Separation comes from the teal around them. Cards may overlap a hero image and be partly covered by it; that layering is the signature of the style.

**Colour by role.**

| Role | Token | Examples |
|---|---|---|
| Ground | `teal`, `teal-mist` | page, wells |
| Content | `surface` + `ink` | every card |
| Action and data | `orange` + `on-orange` | search button, price pills, equalizer bars, app tile |
| Media and secondary | `navy` + `on-navy` | play tile, MORE pill, footer band |
| Illustration accent | `moss` | sparing, never a state |

Orange and navy often appear as a pair of `radius-md` squares. Use that pair as a small brand mark where no logo exists.

**Shapes.** Everything is rounded and chunky. Buttons, fields and price tags are pills (`radius-pill`). Icon tiles are large rounded squares (`radius-xl`) holding one bold glyph. Thumbnails are rounded squares (`radius-md`) set into the card's right edge.

**Type.** One family, Montserrat, from Google Fonts. Heavy (`card-title`, 800) for names, semibold for navigation and the display. The `display` style is stacked over two lines straight on the teal ground.

**Motion.** Gentle and springy: cards rise 8px and fade in, equalizer bars bounce, pills press down 1px. Respect `prefers-reduced-motion`.

## Iconography

Bold, filled, geometric glyphs drawn on a 24px grid: a three-line hamburger with lines shortening downward, a solid play triangle, the 2×2 app grid of rounded squares (`radius-sm`). Glyphs sit centred in an `orange` or `navy` icon tile. No outline icon sets and no emoji. There is no logo file; set the product name in Montserrat 600.

## Accessibility notes

- The poster puts white text on orange and on teal. Both fail contrast (2.3:1 and 1.8:1). Use `on-orange` (navy ink) for text on orange and `ink` for text on teal. White stays only on large glyphs.
- `ink-muted` and `ink-teal` are for `surface` only.
- Focus is a 2px `focus-ring` outline with a 2px offset.

## Using this system

Tokens compile to CSS custom properties (`var(--orange)`, `var(--radius-lg)`, `var(--space-5)`) with a light and a dark theme; light is the fallback. Type styles are classes (`.card-title`, `.label-tracked`). `components/bundle.css` holds plain-CSS components with the `sc-` prefix; they need only the tokens and Montserrat:

```html
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```
