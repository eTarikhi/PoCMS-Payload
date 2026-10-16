# ADR 0004 — Follow Payload's spacing scale

- **Status:** Accepted (2026-10-16, decision D4)
- **Context:** shadcn sizes are multiples of Tailwind's `--spacing` (0.25rem = 4px at a 16px root).
  The Payload 3 admin has a 13px root and spaces everything with `--base` (20px).
- **Decision:** `--spacing: calc(var(--base) / 5)` in the admin `@theme`, so `acn:p-4` equals
  `calc(var(--base) * 0.8)` = 16px and shadcn components follow Payload's rhythm. Type sizes,
  breakpoints and container widths are redefined in px, so a 13px root does not shrink them.
  The radius scale derives from `--radius: 10px` (AdminCN's look), which is also mapped onto
  Payload's `--style-radius-*`.
- **Consequences:** Custom components line up with Payload's fields and buttons. If Payload changes
  `--base`, shadcn components follow automatically. On Payload 4 (16px root, `--spacer-*`), only the
  `--spacing` line changes.
