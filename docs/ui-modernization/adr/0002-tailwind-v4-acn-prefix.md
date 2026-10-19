# ADR 0002 — Isolated Tailwind CSS v4 in the admin, with the `acn` prefix

- **Status:** Accepted (2026-10-16, decision D2)
- **Context:** shadcn components are written with Tailwind utilities. Payload 3 styles its admin
  with its own class names (for example `.table`, `.btn`, `.pill`) and a 13px root font size, and
  the official Payload guide warns that Tailwind's Preflight breaks Payload's field styles. The
  owner chose a class prefix ("prefix acn-") over scoped scanning to rule out collisions.
- **Decision:**
  - Tailwind CSS v4 is loaded **only** in the admin, from `src/styles/admin/admin-ui.css`, imported
    by the `AdminUIProvider` registered in `admin.components.providers`. The `(frontend)` app never
    imports it.
  - The prefix is declared on the theme import: `@import 'tailwindcss/theme.css' layer(theme)
    prefix(acn)`. **Tailwind v4 only accepts lowercase letters as a prefix** — `prefix(acn-)` fails
    with *"Prefixes must be lowercase ASCII letters (a-z) only"* (verified with tailwindcss 4.3.3) —
    and v4 writes the prefix like a variant. So the requested `acn-` prefix is spelled `acn:` in
    class names: `acn:flex`, `acn:hover:bg-primary`, `acn:dark:text-muted-foreground`. Theme
    variables are emitted as `--acn-*`.
  - Unprefixed classes (`table`, `flex`, `container`) generate no CSS at all, so Payload's classes can
    never be overridden by accident. The theme variables cannot clash with Payload 4's
    `--color-border` either.
  - Preflight is not imported. The layer order is declared explicitly:
    `@layer payload-default, payload, theme, base, components, utilities`.
  - Scanning is limited to the admin component folders (`source(none)` + `@source`).
  - Dark mode keys off Payload's `html[data-theme='dark']` with a custom `dark` variant.
  - `cn()` uses `extendTailwindMerge({ prefix: 'acn' })` so conflicting prefixed classes still merge.
  - `components.json` sets `"tailwind": { "prefix": "acn" }`; the shadcn CLI applies it when adding
    components. Existing components were converted with shadcn's own `transformTwPrefixes`
    transformer (`@shadcn/registry`).
- **Consequences:** Class names are slightly longer. Code copied from shadcn docs or AdminCN must be
  run through the prefix transformer (or added with the CLI). Tests never select by Tailwind class.
- **Alternatives considered:** scoped scanning plus `@source not inline('table')` (no prefix);
  wrapper scoping with `important: '#acn'`; Tailwind v3 (which allows `acn-` literally but is not
  supported by the current shadcn registry).
- **Update (2026-10-19, ADR 0009):** `components.json` was removed with the shadcn CLI workflow;
  the prefix is enforced by `pnpm check:tw-prefix` alone.
