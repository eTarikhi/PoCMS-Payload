# ADR 0010 — A warm off-white canvas for the light theme

- **Status:** Accepted (2026-10-19).
- **Context:** Payload's light theme paints everything white: the page, the sidebar, inputs, cards
  and tables. On a bright screen a fully white page glares, and white inputs on a white page are
  only told apart by their 1 px border. The owner asked for a background that lowers the glare
  while keeping text contrast and readability.
- **Decision:**
  - The page (`--theme-bg`, Payload's own variable, so the sidebar, sticky bars, drawers and
    overlays follow) becomes **`#f7f6f3`**: OKLCH L 97.3 %, chroma 0.004 at the brand's amber hue.
    That is 8 % less luminance than white, with a warm "paper" tint instead of a grey cast.
  - Content surfaces stay white: inputs (`--theme-input-bg`), cards and widgets (`--card`), popups
    (`--popover`), list tables and collapsible content (`--theme-elevation-0`). They now read as
    sheets laid on the page, which is the main readability gain (fields stand out without heavier
    borders).
  - Elevation steps 50–300 get the same faint tint and sit slightly darker than Payload's greys, so
    stripes, hovers, the list search bar and borders stay visible against the canvas. Text steps
    (400 and up) keep Payload's neutral greys.
  - Sidebar group headings move from Payload's elevation-400 (2.6:1) to `--muted-foreground`.
  - No gradient on working pages: Payload paints sticky bars (document controls, app header
    gradient) with a solid `--theme-bg`, so a page gradient would show seams. Only the sign-in
    screens (`.template-minimal`) get a faint amber glow from the top.
  - Dark mode is unchanged: there the page and surfaces share elevation-0 again.
- **Consequences:**
  - Contrast on the canvas (checked in CI by `scripts/check-contrast.mjs`, which now reads the
    canvas and the tinted steps from `tokens.css`): body text 12.4:1, muted text 5.4:1, primary
    amber text 4.6:1, error 5.4:1, success 5.3:1, warning 5.3:1; every sidebar icon tone stays
    above 3:1. The amber primary has the least headroom: a darker canvas (below about `#f6f5f1`)
    would need a darker `--brand-amber-700`.
  - New components should put content on `acn:bg-card` (white) and leave the page itself
    transparent; the TanStack list table now does (its phone cards already did).
