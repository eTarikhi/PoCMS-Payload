# GraphQL result limits and join audit

## Scope and configuration

This change bounds GraphQL collection find/version lists and join resolver pages. It does not change Payload's Local API or REST pagination, and it does not silently truncate document-embedded array fields.

The application config has three join fields:

| Join field               | Configured `defaultLimit` | Effective GraphQL default |
| ------------------------ | ------------------------: | ------------------------: |
| `Skills.relatedProjects` |                        10 |                        10 |
| `MailThreads.messages`   |                       100 |                       100 |
| `Roles.members`          |                   omitted |                        10 |

Payload's collection find operation defaults an omitted paginated limit to 10. The Admin's `pagination.defaultLimit` is a UI default, not an API maximum. `versionsArticles` and other collection version-list roots also expose `limit` and are checked by the same GraphQL rule. Count roots return `totalDocs`, not a document list.

## GraphQL policy

The maximum is **100** documents per collection/version list or join page. This matches the highest built-in Admin page-size choice and the configured 100-message join default.

- Omitted or `null` collection limits keep Payload's default of 10. Omitted or `null` join limits use the field's configured `defaultLimit`, falling back to 10; configured defaults are capped at 100.
- Positive explicit values through 100 are accepted. A join's `defaultLimit` is a default, not a cap: an explicit value above the default remains valid through 100.
- Negative values, `limit: 0` on ordinary collection/version lists or non-count joins, and values above 100 are rejected during GraphQL validation before a resolver runs. Limits above 100 are rejected, not silently clamped.
- `pagination: false` remains available only with an explicit positive limit through 100. With an omitted, null, or zero limit it could disable the SQL limit and is rejected.
- Payload's `count: true, limit: 0` join form remains count-only: it returns `docs: []`, `hasNextPage: false`, and the exact `totalDocs`, without finding joined documents.

The rule checks every schema field with a `limit` argument, including collection versions and joins. Tests also cover aliases, selected-operation fragments, variable coercion/defaults, and alternate pagination arguments. Schema inventory asserts that every collection/version `docs` list root and every configured join has a `limit` argument; count roots do not return `docs`.

## Admin compatibility and resolver behavior

The Admin GraphQL document view generates one-document queries (`Article(id: $id)`, globals, and their nested selections), not paginated collection roots. Its relationship/join selections omit optional join limits. Tests generate all configured Admin document queries at the six supported depth settings and confirm the list-limit rule adds no rejection; the existing full validation suite also executes the deepest Article Admin query. A static validation pass found a deepest Project Admin query with complexity 1,204, which the pre-existing 1,000 complexity threshold rejects. This increment does not change that unrelated threshold. Join resolver tests confirm that supported omitted-limit join selections use configured/default page sizes.

Payload's GraphQL join resolver fetches one extra row to calculate `hasNextPage`, then removes that look-ahead row. The package patch now applies the configured default or fallback 10, caps the returned page at 100, and preserves this look-ahead. Multiple parent records still issue separate join `find` calls with parent-specific filters; the page cap applies per parent. This change does **not** batch those calls or establish a database-performance improvement.

## Explicit boundary and compatibility

Payload models `hasMany` relationships as document-embedded arrays without a `limit` argument. They are not collection find/version roots or join resolver pages, so this increment deliberately leaves their existing behavior unchanged. The generated `PayloadFolder.documentsAndFolders` join is polymorphic (`collection` is an array); Payload 3.90.2's GraphQL join resolver explicitly throws for that field before fetching data. The list rule still validates its `limit` argument, but this change does not implement the unsupported resolver.

A 100-item per-field limit is not a total-response-size bound, and this change does not claim that every nested GraphQL list is capped. Bounding embedded arrays or implementing polymorphic folder joins would require separate schema/resolver compatibility decisions rather than silent truncation.

GraphQL clients that relied on `limit: 0`, `pagination: false` without a positive limit, or more than 100 results from one collection/version/join field now receive a validation error. There is no external-client telemetry in this repository, so review this compatibility impact before deployment.

No database-backed integration, SQL-plan, latency, N+1 remediation, or performance measurement is claimed. Existing route authorization, method restrictions, cache protection, body size/deadline, nesting, complexity/fragment, and rate-limit guards remain on the target branch and are exercised by the GraphQL contract suite; this change does not alter them.
