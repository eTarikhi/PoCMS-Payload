# ADR 0003 — Inter as the admin typeface, self-hosted

- **Status:** Accepted (2026-10-16, decision D3)
- **Context:** Payload 3 uses the system font stack. Payload 4 defaults to Inter, shadcnstudio's
  guides use Inter, and it looks close to AdminCN's Geist. The frontend keeps Open Sans.
- **Decision:** Load Inter (variable, latin + latin-ext) from the `@fontsource-variable/inter`
  package inside the admin stylesheet and set Payload's `--font-body` to
  `'Inter Variable', <Payload's system stack>`. Tailwind's `--font-sans` points at the same variable.
  Tabular figures (`acn:tabular-nums`) are used for numbers in KPIs and tables.
- **Consequences:** No request to Google at build or run time (builds also work offline). The admin
  CSS grows by the `@font-face` rules; the font files are fetched only by the admin and cached.
  `next/font` is not used because the generated `(payload)/layout.tsx` must not be edited.
