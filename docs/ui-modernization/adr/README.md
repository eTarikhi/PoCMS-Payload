# Architecture decision records — admin UI modernization

Decisions D1–D8 from the analysis (`../shadcn-payload-ui-analysis.md` §11), as signed off by the
project owner on 2026-10-16, and later decisions (0009–0011). Each record states the context, the decision as implemented, and its
consequences. Status values: *Accepted*, *Superseded*, *Deprecated*.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-base-ui-primitives.md) | Base UI (shadcn `base-vega`) as the primitive library | Accepted, amended by 0009 |
| [0002](0002-tailwind-v4-acn-prefix.md) | Isolated Tailwind CSS v4 in the admin with the `acn` prefix | Accepted |
| [0003](0003-inter-admin-typeface.md) | Inter as the admin typeface, self-hosted | Accepted |
| [0004](0004-payload-spacing-scale.md) | Follow Payload's spacing scale | Accepted |
| [0005](0005-content-model-changes.md) | Content-model changes: pre-approved, additive only | Accepted |
| [0006](0006-stay-on-payload-3.md) | Stay on Payload 3.9x, design for v4 | Accepted |
| [0007](0007-tanstack-table-list-views.md) | TanStack Table renders the collection list views | Accepted |
| [0008](0008-user-roles.md) | Roles on Users (`admin`, `editor`) | Superseded by 0011 |
| [0009](0009-payload-native-component-layout.md) | Admin components laid out by Payload slot, no template tooling | Accepted |
| [0010](0010-light-canvas.md) | A warm off-white canvas for the light theme | Accepted |
| [0011](0011-roles-collection.md) | Roles as documents: access levels per collection, tool capabilities | Accepted |
