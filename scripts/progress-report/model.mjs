/**
 * The curated half of the progress report: what the plan said, what each commit delivered, the status
 * of every roadmap item, estimates, the backlog, dependencies and risks. Commit SHAs tie each entry to
 * the history, so build.mjs can date it and measure it. Update this file, then run
 * `node scripts/progress-report/build.mjs` to refresh the report.
 *
 * Effort unit: ideal engineer-days for one senior engineer, the unit of the roadmap's own estimates
 * (docs/ui-modernization/shadcn-payload-ui-analysis.md §9). Roadmap phases use the midpoint of the
 * plan's range; everything else is the report author's estimate on the same scale.
 */

export const meta = {
  title: 'PoCMS development progress report',
  subtitle: 'Admin modernisation programme: retrospective, outlook and roadmap alignment',
  reportDate: '2026-10-20',
  /** Commits and charts are bucketed by calendar day in this zone (the owner's commits use +03:30). */
  timeZone: 'Asia/Tehran',
  timeZoneLabel: 'Asia/Tehran (UTC+03:30)',
  repo: 'eTarikhi/PoCMS-Payload',
  branch: 'arena/1e75852c-pocms-payload',
  /** Last commit before the programme (the branch was cut from it). */
  baseline: '0d7dde1',
  periodStart: '2026-10-01',
  /** When the measurements in this file were taken (local time). */
  measuredAt: '2026-10-20T02:50:00+03:30',
  /** Forecasts assume the next working session starts on this day. */
  nextSession: '2026-10-21',
}

/** Status vocabulary used for roadmap items and backlog entries. */
export const STATUS = {
  done: { label: 'Done', color: '#15803d' },
  changed: { label: 'Done, changed', color: '#2563eb' },
  partial: { label: 'Partial', color: '#d97706' },
  open: { label: 'Not started', color: '#b91c1c' },
  deferred: { label: 'Deferred (optional)', color: '#a8a29e' },
}

/**
 * Roadmap P0–P6 as planned in §9 (estimates in working days, optional items flagged), with the status
 * of every item as verified in the repository on the report date.
 */
export const phases = [
  {
    id: 'P0',
    name: 'Foundations & spike',
    min: 4,
    max: 6,
    items: [
      ['Postgres dev environment, committed .env.example, seed', 'done', 'c65bc55'],
      [
        'Quality baseline: ESLint, typecheck, int/e2e green, CI workflow',
        'done',
        'daf243e, d430e6e',
      ],
      ['Visual baseline: 48 screenshots, light/dark, 1440/768/375 px', 'done', 'daf243e'],
      [
        'Bundle and CSS baseline (Playwright transfer sizes, not bundle-analyzer)',
        'done',
        '2f87cb0',
      ],
      ['Dependency audit: unused packages removed', 'done', 'cccdf04'],
      [
        'Tailwind isolation spike (layers, scanning, .table, rem, portals, dark variant)',
        'done',
        '7414431, ADR 0002',
      ],
      ['Bump to Payload 3.91 and a v4 beta smoke test', 'deferred', 'optional; still 3.90.2', true],
      ['ADRs for decisions D1–D8', 'done', '2f87cb0'],
    ],
  },
  {
    id: 'P1',
    name: 'Tokens & theming',
    min: 4,
    max: 6,
    items: [
      ['tokens.css: three tiers, light/dark, status tokens', 'done', 'b3f6f63'],
      [
        'Payload-native overrides: radius, Inter, navy dark theme, primary button',
        'done',
        'b3f6f63',
      ],
      ['Automated contrast check of every token pair, in CI', 'done', 'check:contrast'],
      ['Visual review of core surfaces in both themes', 'done', 'screenshots/p6-after'],
      ['v3 to v4 token map documented', 'done', 'admin-ui-guide § Payload 4 readiness'],
    ],
  },
  {
    id: 'P2',
    name: 'Component foundation',
    min: 5,
    max: 7,
    items: [
      ['Tailwind v4, Base UI, cva, tw-animate-css installed; PostCSS config', 'done', '7414431'],
      ['components.json and shadcn registries', 'changed', 'added in 7414431, retired by ADR 0009'],
      ['Primitive set reconciled with the tokens', 'done', '25 primitives'],
      ['AdminUIProvider registered as an admin provider', 'done', 'b3f6f63'],
      ['Living style guide (/admin/ui-kit, now /admin/gallery)', 'done', '1eb40e7, d9ba8a3'],
      [
        'Component tests (Testing Library) and axe checks',
        'partial',
        'axe in e2e; no component tests',
      ],
    ],
  },
  {
    id: 'P3',
    name: 'Branding & IA',
    min: 3,
    max: 5,
    items: [
      ['Logo, icon and admin.meta', 'done', '364f38c'],
      ['admin.group mapping, descriptions, useAsTitle/defaultColumns audit', 'done', '364f38c'],
      ['Nav slots: Create menu, View site, style-guide link', 'done', '364f38c'],
      ['Resolve orphan SiteSettings / Navigation files', 'open', 'both files are still empty'],
      [
        'About / Header as globals',
        'partial',
        'optional; Footer is a global, the others are one-document collections',
        true,
      ],
      ['e2e tests for groups and branding', 'done', 'navigation.e2e'],
    ],
  },
  {
    id: 'P4',
    name: 'Dashboard',
    min: 7,
    max: 10,
    items: [
      ['Query layer through the Local API with req and overrideAccess: false', 'done', '51945f8'],
      ['Six widgets (KPIs, health, activity, recent changes, quick actions)', 'done', '51945f8'],
      [
        'Chart island (planned with Recharts)',
        'changed',
        'own accessible chart, about 107 kB less',
      ],
      ['Empty, loading and error states', 'done', 'all widgets'],
      ['Role-aware defaultLayout, widget fields, i18n labels', 'partial', 'no i18n labels'],
      ['e2e (widgets, edit mode) and axe', 'done', 'dashboard.e2e'],
    ],
  },
  {
    id: 'P5',
    name: 'List & edit UX',
    min: 8,
    max: 12,
    items: [
      [
        'Cells: thumbnail, status, colour, icon, proficiency, relative date',
        'done',
        '961da3a, 3b950c2',
      ],
      ['Fields: colour picker, icon picker, image source', 'partial', 'no ImageSourceField'],
      ['Edit layouts: tabs, rows, sidebar, descriptions, conditions', 'done', '3b950c2'],
      [
        'Media sizes, focal point, MIME types, thumbnails, regeneration script',
        'partial',
        'thumbnail size and admin thumbnail only',
      ],
      [
        'Drafts, live preview, orderable, command palette, SEO plugin',
        'partial',
        'optional; live preview and command menu delivered',
        true,
      ],
      ['Task-based acceptance tests against the baseline', 'open', 'feature e2e only'],
    ],
  },
  {
    id: 'P6',
    name: 'QA & handover',
    min: 4,
    max: 6,
    items: [
      ['Visual-regression suite in CI', 'partial', 'suite exists (pnpm test:visual), not in CI'],
      [
        'axe suite, manual screen-reader pass, enforced budgets',
        'partial',
        'axe in e2e; no SR pass; budget measured by hand',
      ],
      ['Docs: guide, ADRs, AGENTS.md, README, changelog', 'partial', 'no changelog'],
      ['Payload 4 readiness checklist', 'done', 'ADR 0006, admin-ui-guide'],
    ],
  },
]

/**
 * Deliverables in the order they landed. `estimate` is in ideal engineer-days; for roadmap phases
 * build.mjs replaces it with the plan midpoint scaled by item completion. `source`:
 * plan (analysis), roadmap (approved P0–P6 scope and decisions), request (owner change requests),
 * unplanned (defects and rework). `row` groups deliverables in the timeline.
 */
export const deliverables = [
  // Foundation, built by the owner before the programme (not estimated).
  {
    id: 'F1',
    row: 'Repository, licence and docs',
    source: 'foundation',
    commits: ['04149b2', 'fb669c7', '40e6f9a', 'd409a63', '3d7d995', 'ff65b6f', 'b330585'],
  },
  {
    id: 'F2',
    row: 'Content model (collections, globals)',
    source: 'foundation',
    commits: ['f53bdda'],
  },
  { id: 'F3', row: 'Seed data and Vercel storage', source: 'foundation', commits: ['d3cbaa3'] },
  { id: 'F4', row: 'Vercel Analytics, Speed Insights', source: 'foundation', commits: ['f4eda1e'] },
  { id: 'F5', row: 'GraphQL for development', source: 'foundation', commits: ['d49e680'] },
  {
    id: 'F6',
    row: 'Public front end',
    source: 'foundation',
    commits: ['6c9fce5', '290f382', 'd5512d6', '2182545', 'ac92953', 'fad70cf'],
  },
  {
    id: 'F7',
    row: 'Email adapters (Resend, Nodemailer)',
    source: 'foundation',
    commits: ['0d7dde1'],
  },

  // Programme.
  {
    id: 'PLN',
    title: 'Admin UI analysis and phased roadmap',
    short: 'Analysis and roadmap',
    source: 'plan',
    estimate: 4,
    commits: ['19e6c2c'],
    work: 'Audit of the stock admin, AdminCN and shadcnstudio study, Payload 3.90.2 capabilities checked in the packages, Payload 4 beta outlook; seven phases estimated at 35–52 engineer-days and eight decisions (D1–D8).',
  },
  {
    id: 'P0',
    title: 'P0 Foundations',
    source: 'roadmap',
    commits: ['c65bc55', 'daf243e', '2f87cb0', '4b0e761', '5a2935f', 'd430e6e', 'd94daf8'],
    work: 'Postgres 17 compose file and seed with real media; ESLint fixed (0 errors), typecheck and a CI workflow (lint, types, generated-file drift, contrast, int, build + e2e); 48 baseline screenshots; bundle baseline 645.2 kB JS / 45.2 kB CSS; ADRs 0001–0008.',
  },
  {
    id: 'P1',
    title: 'P1 Tokens and theming',
    source: 'roadmap',
    commits: ['b3f6f63'],
    work: 'Three-tier tokens (brand, Payload variables, semantic), self-hosted Inter, navy dark theme, AA primary (#996600 / #da9100), CI contrast check of 34 token pairs.',
  },
  {
    id: 'P2',
    title: 'P2 Component foundation',
    source: 'roadmap',
    commits: ['7414431', '1eb40e7'],
    work: 'Isolated Tailwind v4 (acn: prefix, no Preflight, scoped scanning, layer order after Payload), 25 Base UI primitives, AST-based prefix checker in CI, living style guide with axe checks.',
  },
  {
    id: 'D8',
    title: 'D8 Roles on Users',
    source: 'roadmap',
    estimate: 1.5,
    commits: ['72f69d0'],
    work: 'Admin and editor roles saved to the JWT, no self-promotion, first user is an admin, lock-out protection; integration tests.',
  },
  {
    id: 'P3',
    title: 'P3 Branding and IA',
    source: 'roadmap',
    commits: ['364f38c'],
    work: 'Logo, icon and meta; sidebar groups; permission-aware Create menu; View site link; one-document collections (Header, About) that redirect to their document.',
  },
  {
    id: 'P4',
    title: 'P4 Dashboard',
    source: 'roadmap',
    commits: ['51945f8'],
    work: 'Server-component widgets on Payload’s modular dashboard (Welcome, Content count, Publishing activity, Needs attention, Recent changes) using the Local API with access control; role-aware layout; axe in both themes.',
  },
  {
    id: 'P5',
    title: 'P5 List and edit UX',
    source: 'roadmap',
    commits: ['961da3a', '3b950c2', '2d0d1db'],
    work: 'TanStack Table v9 lists with boolean, progress and colour cells; edit layouts; colour and icon tile pickers; media thumbnails; lazy islands brought /admin back from +254 kB to +21 kB JS.',
  },
  {
    id: 'P6',
    title: 'P6 QA and handover',
    source: 'roadmap',
    commits: ['c48232a', 'cccdf04', 'f1caab0', 'ec54913', 'e73fe4d'],
    work: 'Admin UI guide, README and docs index, AGENTS.md, 48 after-screenshots, unused packages removed, front-end fix for an unsaved Footer global.',
  },
  {
    id: 'UI',
    title: 'Frontier UI port',
    source: 'request',
    estimate: 4,
    commits: ['2d8383c', '76c2e02', 'df5ad98'],
    work: 'From three exploratory branches: sidebar icons with a collapsible icon rail, theme switch, cache refresh, article Live Preview, list summaries, 14 px body text.',
  },
  {
    id: 'CR-01',
    title: 'Command menu and shortcuts',
    source: 'request',
    estimate: 3,
    commits: ['9609da6', 'df2ce9b', '1010b73'],
    work: 'Ctrl+K command menu loaded on demand (6.5 kB chunk), theme reveal animation, keyboard-shortcut layer with help and an off switch; budget raised to +150 / +40 kB.',
  },
  {
    id: 'CR-02',
    title: 'Interactive publishing chart',
    short: 'Publishing chart',
    source: 'request',
    estimate: 2,
    commits: ['2f2dd53', 'd60615b', '5fae69a'],
    work: 'Range, series, tooltips and month drill-down; rebuilt without Recharts as an accessible radio-group plot (/admin 787.2 kB down to 680.1 kB).',
  },
  {
    id: 'CR-03',
    title: 'Trash and sparklines',
    source: 'request',
    estimate: 2.5,
    commits: ['463a21c', '7ffebf7'],
    work: 'Payload trash on eight collections: editors restore, only admins delete permanently; server-rendered sparklines on the count cards.',
  },
  {
    id: 'CR-04',
    title: 'Header developer tools',
    source: 'request',
    estimate: 1.5,
    commits: ['786f5e2'],
    work: 'GraphQL Playground button and a developer tools menu in the header (REST JSON of the current view, access, session).',
  },
  {
    id: 'CR-05',
    title: 'Header account and cache actions',
    short: 'Account and cache actions',
    source: 'request',
    estimate: 1.5,
    commits: ['f6d9deb'],
    work: 'Account menu with log out, cache actions in the dev menu, one sidebar control (mobile menu, desktop rail), themed sidebar icon colours.',
  },
  {
    id: 'CR-06',
    title: 'Code generators in the dev menu',
    short: 'Generators in dev menu',
    source: 'request',
    estimate: 1,
    commits: ['7787e5d'],
    work: 'Types, import map, Drizzle schema, GraphQL schema and generate:all from the menu, in development only.',
  },
  {
    id: 'CR-07',
    title: 'Restart and migrations',
    source: 'request',
    estimate: 1.5,
    commits: ['6daf209'],
    work: 'Restart dev server, create migration, migration status, purge cached pages; menu items depend on the environment.',
  },
  {
    id: 'CR-08',
    title: 'Rail group icons, responsive layout',
    short: 'Rail icons, responsive',
    source: 'request',
    estimate: 2,
    commits: ['dab277f', '9f295c8'],
    work: 'Group headings keep icons in the rail; saved views removed at the owner’s request; phone and tablet layout for header, dashboard, lists and menus.',
  },
  {
    id: 'CR-09',
    title: 'Phone card lists',
    source: 'request',
    estimate: 1.5,
    commits: ['ff0dd65', '125225f'],
    work: 'List rows become cards on phones, with thumbnails and selection.',
  },
  {
    id: 'CR-10',
    title: 'Responsive pass',
    source: 'request',
    estimate: 1.5,
    commits: ['3d2f844'],
    work: 'Fluid type, menu sizing and touch targets across the admin.',
  },
  {
    id: 'CR-11',
    title: 'Payload-native restructure',
    source: 'request',
    estimate: 4,
    commits: ['d9ba8a3', '3aeb9dd'],
    work: 'Components laid out by Payload slot (ADR 0009); UI kit replaced by a component gallery; dashboard integrations research; bundle re-measured.',
  },
  {
    id: 'CR-12',
    title: 'Settings, access and admin tools',
    short: 'Settings, access, tools',
    source: 'request',
    commits: [
      '712a17c',
      '35bea29',
      '90807ad',
      '1ebcdf5',
      'c1ec5a8',
      '419dec3',
      '7dcf315',
      'a1fe7c8',
    ],
    work: 'Site settings group, low-glare light canvas, Roles collection with access levels and capabilities, GraphQL document tab, and the Site traffic, Page speed, Deployments and CI status widgets.',
  },
  {
    id: 'CR-13',
    title: 'Vercel build fix (reverted)',
    source: 'unplanned',
    estimate: 0.5,
    reverted: true,
    commits: ['b2a3425', '2b7cde3', '1238587'],
    work: 'Build no longer failed without PAYLOAD_SECRET / POSTGRES_URL; two CI fixes. Reverted the same day at the owner’s request.',
  },
  {
    id: 'CR-14',
    title: 'Undo at the owner’s request',
    short: 'Undo (owner request)',
    source: 'unplanned',
    estimate: 0,
    commits: ['4dd83a0'],
    work: 'Revert of CR-13. CI has been red since then (prefix check).',
  },
  {
    id: 'CR-15',
    title: 'Page speed widget fix',
    source: 'unplanned',
    estimate: 2,
    commits: ['adff4e0'],
    work: 'Lighthouse lab test through PageSpeed Insights streamed with Suspense and cached a day; CrUX fallback; Google errors explained with fix links; Referer header; 60 s function limit.',
  },
  {
    id: 'OWN',
    row: 'Owner commits',
    source: 'owner',
    commits: ['3ad199d', '9e84aec', 'b4dd2f0', 'f195abc', 'ad48283'],
  },
]

/** The current change request, item by item (estimates in ideal engineer-days). */
export const cr12 = {
  started: '2026-10-19T04:14:43+03:30', // 3aeb9dd, the previous delivery
  items: [
    {
      id: 'A',
      title: 'Site settings group; Services under Profile',
      estimate: 0.5,
      commit: '712a17c',
    },
    { id: 'B', title: 'Low-glare light canvas (ADR 0010)', estimate: 0.5, commit: '35bea29' },
    {
      id: 'C',
      title: 'Roles, access levels, capabilities (ADR 0011)',
      estimate: 4,
      commit: 'c1ec5a8',
      also: '90807ad',
    },
    { id: 'D', title: 'GraphQL tab wherever the API tab exists', estimate: 1.5, commit: '1ebcdf5' },
    { id: 'E1', title: 'Site traffic widget', estimate: 2, commit: '419dec3' },
    { id: 'E2', title: 'Page speed widget', estimate: 1.5, commit: '7dcf315' },
    { id: 'E3', title: 'Deployments and CI status widgets', estimate: 2, commit: 'a1fe7c8' },
    { id: 'E4', title: 'Jobs panel, scheduled tasks, Page speed history', estimate: 5 },
    { id: 'E5', title: 'Audit log', estimate: 3 },
    { id: 'E6', title: 'System page', estimate: 2 },
    { id: 'E7', title: 'Terminal page (development only)', estimate: 3 },
    { id: 'E8', title: 'Close-out: docs and bundle measurement', estimate: 1 },
  ],
}

/**
 * Forward plan. `estimate` in ideal engineer-days; `owner` marks steps only the owner can take;
 * `after` lists dependencies; `window` is the likely calendar window under the forecast assumptions.
 */
export const backlog = [
  {
    id: 'DEC',
    title: 'Decide on the two CI fixes',
    group: 'Unblock',
    owner: true,
    estimate: 0,
    after: [],
    detail:
      'Re-apply 2b7cde3 (status tone renamed) and 1238587 (screen-reader text clipped) without the reverted build change. Restores green CI; until then lint passes but the prefix check stops the pipeline before tests run.',
  },
  {
    id: 'ENV',
    title: 'Vercel environment variables',
    group: 'Unblock',
    owner: true,
    estimate: 0,
    after: [],
    detail:
      'PAYLOAD_SECRET and POSTGRES_URL for Preview builds; GOOGLE_API_KEY with both Google APIs enabled; VERCEL_TOKEN / VERCEL_PROJECT_ID; GITHUB_TOKEN if the repo turns private; CRON_SECRET for E4.',
  },
  {
    id: 'MIG',
    title: 'Migration baseline and deploy step',
    group: 'Unblock',
    estimate: 1,
    after: ['DEC'],
    detail:
      'There is no src/migrations: production gets schema changes only through a development-mode push. Roles, trash and widget changes already need it; E4 and E5 add collections. Create a baseline migration and run payload migrate during deployment.',
  },
  {
    id: 'E4',
    title: 'Jobs panel and scheduled tasks',
    group: 'CR-12 close-out',
    estimate: 4,
    after: ['DEC', 'MIG', 'ENV'],
    detail:
      'maintenance queue run by Vercel Cron calling the jobs endpoints with a CRON_SECRET check (daily on Hobby); tasks: empty old trash (daily), PageSpeed run into a pagespeed-reports collection (daily), broken-link check (weekly); /admin/jobs with Run now and Cancel (manageJobs).',
  },
  {
    id: 'E4b',
    title: 'Page speed history',
    group: 'CR-12 close-out',
    estimate: 1,
    after: ['E4'],
    detail:
      'Lab score trend in the Page speed widget from stored runs; a Run again action using the pagespeed cache tag.',
  },
  {
    id: 'E5',
    title: 'Audit log',
    group: 'CR-12 close-out',
    estimate: 3,
    after: ['DEC', 'MIG'],
    detail:
      'afterChange / afterDelete hooks into an admin-only collection; filterable list and a dashboard widget (viewAuditLog capability).',
  },
  {
    id: 'E6',
    title: 'System page',
    group: 'CR-12 close-out',
    estimate: 2,
    after: ['DEC'],
    detail:
      'Versions (commit, Node, Next, Payload), environment, which integrations are configured (never values), newer releases on npm (viewSystem).',
  },
  {
    id: 'E7',
    title: 'Terminal page',
    group: 'CR-12 close-out',
    estimate: 3,
    after: ['E6'],
    detail:
      'Development only, useTerminal capability, allow-listed package scripts with streamed output; reuses the environment detection of E6. Needs a short security review.',
  },
  {
    id: 'E8',
    title: 'Docs and bundle close-out',
    group: 'CR-12 close-out',
    estimate: 1,
    after: ['E4b', 'E5', 'E7'],
    detail: 'Guide sections for the tools, perf-budget entry, gallery specimens.',
  },
  {
    id: 'QA',
    title: 'Roadmap gaps and quality gates',
    group: 'Hardening',
    estimate: 6,
    after: ['DEC'],
    detail:
      'Visual suite and a bundle check in CI, changelog, component tests, task-based acceptance tests, orphan globals resolved, screen-reader pass (needs a person).',
  },
  {
    id: 'CNT',
    title: 'Content and publishing',
    group: 'Next horizon',
    estimate: 10,
    after: ['E4', 'QA'],
    detail:
      'Drafts and versions with scheduled publishing (runs on the jobs queue from E4), SEO plugin, admin i18n labels, SiteSettings and Navigation globals, media size regeneration, list group-by.',
  },
  {
    id: 'P7',
    title: 'Payload 4 migration',
    group: 'Platform',
    estimate: 10,
    after: ['QA'],
    external: 'Payload 4 stable (4.0.0-beta.1 on 2026-10-13)',
    detail:
      'Codemod, tokens re-pointed to v4 semantic tokens, payload-overrides.css deleted, list view and custom views re-checked. The visual suite in CI is the safety net.',
  },
]

/** Horizons of the long-term roadmap, oldest first. `progress` is the delivered share of effort. */
export const horizons = [
  {
    id: 'H0',
    title: 'Foundation',
    name: 'Foundation',
    sub: 'content model, seed, public site, email',
    when: '1–12 Oct',
    status: 'done',
  },
  {
    id: 'H1',
    title: 'Roadmap',
    name: 'Roadmap P0–P6',
    sub: 'tokens, components, IA, dashboard, lists',
    when: '16 Oct',
    status: 'done',
  },
  {
    id: 'H2',
    title: 'Experience',
    name: 'Experience',
    sub: 'shell, command menu, charts, trash, dev tools, mobile',
    when: '17–19 Oct',
    status: 'done',
  },
  {
    id: 'H3',
    title: 'Operations',
    name: 'Operations and governance',
    sub: 'roles, integrations, admin tools (CR-12)',
    when: '19–22 Oct',
    status: 'current',
  },
  {
    id: 'H4',
    title: 'Hardening',
    name: 'Hardening',
    sub: 'roadmap gaps, CI gates, migrations',
    when: 'late Oct',
    status: 'next',
  },
  {
    id: 'H5',
    title: 'Content',
    name: 'Content and publishing',
    sub: 'drafts, scheduling, SEO, i18n',
    when: 'when scheduled',
    status: 'later',
  },
  {
    id: 'H6',
    title: 'Payload 4',
    name: 'Payload 4',
    sub: 'P7 migration after v4 is stable',
    when: 'after v4 GA',
    status: 'later',
  },
]

/** The roadmap's guiding principles (§8.1) and how the delivered work measures against them. */
export const principles = [
  {
    title: 'Payload owns the shell',
    rating: 'aligned',
    evidence:
      'Native dashboard, list/edit slots and custom views; components laid out by Payload slot (ADR 0009). TanStack lists are the one owner-approved replacement of a core view (D7).',
  },
  {
    title: 'One source of truth for tokens',
    rating: 'aligned',
    evidence:
      'tokens.css tiers feed Payload, components and Tailwind; contrast of every pair checked in CI; ADR 0010 canvas set in one place.',
  },
  {
    title: 'Additive and reversible',
    rating: 'aligned',
    evidence:
      'All changes go through config and extension points. The 19 Oct revert of three commits applied cleanly.',
  },
  {
    title: 'Server-first',
    rating: 'aligned',
    evidence:
      'Widgets and integrations are server components (secrets stay on the server); sparklines are server SVG; Page speed streams with Suspense. JS on /admin +39.9 kB in total.',
  },
  {
    title: 'Accessible by default (WCAG 2.2 AA)',
    rating: 'partial',
    evidence:
      'axe checks in e2e for dashboard, gallery, menus and roles in both themes; token contrast in CI. Missing: manual screen-reader pass. With CI red, the gates don’t run.',
  },
  {
    title: 'Portable to Payload 4',
    rating: 'partial',
    evidence:
      'Token map and readiness checklist (ADR 0006); overrides kept in one file. Custom list view, document tab and views add re-check work for P7.',
  },
]

/** Risk register. likelihood and impact on a 1–5 scale. */
export const risks = [
  {
    id: 'R1',
    title: 'CI stays red after the revert',
    likelihood: 5,
    impact: 4,
    mitigation: 'Owner decision DEC; until then, run the suites locally before each push.',
  },
  {
    id: 'R2',
    title: 'Production schema drift (no migrations)',
    likelihood: 4,
    impact: 5,
    mitigation: 'MIG before E4/E5: baseline migration, payload migrate in the deploy step.',
  },
  {
    id: 'R3',
    title: 'Preview builds fail without PAYLOAD_SECRET',
    likelihood: 4,
    impact: 3,
    mitigation: 'Set the variables for Preview (ENV); the code guard stays reverted.',
  },
  {
    id: 'R4',
    title: 'Terminal page widens the attack surface',
    likelihood: 2,
    impact: 5,
    mitigation: 'Development only, allow-list, capability check, security review before merge.',
  },
  {
    id: 'R5',
    title: 'Integration widgets misconfigured',
    likelihood: 3,
    impact: 2,
    mitigation: 'Widgets explain missing keys and Google errors with fix links (adff4e0).',
  },
  {
    id: 'R6',
    title: 'Bundle creep from new admin views',
    likelihood: 2,
    impact: 3,
    mitigation:
      'Server components and next/dynamic; 110 kB JS headroom; add a CI bundle check (QA).',
  },
  {
    id: 'R7',
    title: 'Payload 4 timing and rework',
    likelihood: 3,
    impact: 3,
    mitigation:
      'Readiness checklist; visual suite in CI before P7; stay on 3.9x until v4 is stable.',
  },
  {
    id: 'R8',
    title: 'Upstream bug: media folders with trash',
    likelihood: 3,
    impact: 2,
    mitigation: 'Folders not enabled; tracked in payloadcms/payload#16327.',
  },
  {
    id: 'R9',
    title: 'Lost CI history weakens traceability',
    likelihood: 4,
    impact: 2,
    mitigation: 'Keep failed and cancelled runs (or export results) so pass rates can be measured.',
  },
]

/** Bundle measurements on /admin (compressed kB), from docs/ui-modernization/perf-budget.md. */
export const bundle = {
  baseline: { js: 645.2, css: 45.2 },
  budgets: [
    { from: '2026-10-16T00:00:00+03:30', js: 60, css: 25 },
    { from: '2026-10-17T01:50:21+03:30', js: 150, css: 40 }, // raised with 9609da6
  ],
  points: [
    { sha: '2f87cb0', label: 'P0 baseline', js: 645.2, css: 45.2 },
    {
      sha: '2d0d1db',
      at: '2026-10-16T21:30:00+03:30',
      label: 'First P5 build (not shipped)',
      js: 899.5,
      interim: true,
    },
    { sha: '2d0d1db', label: 'After P5', js: 666.2, css: 58.6 },
    { sha: '76c2e02', label: 'Admin shell', js: 666.4, css: 61.2 },
    { sha: 'df2ce9b', label: 'Command menu', js: 669.1, css: 61.6 },
    { sha: '2f2dd53', label: 'Chart with Recharts', js: 787.2, interim: true },
    { sha: 'd60615b', label: 'Chart without Recharts', js: 680.1, css: 61.9 },
    { sha: 'd9ba8a3', label: 'Restructure', js: 684.9, css: 63.4 },
    { sha: 'adff4e0', label: 'Today', js: 685.1, css: 64.4 },
  ],
  /** Measured for this report against a production build of adff4e0 (2026-10-20). */
  latest: [
    ['/admin/login', 14, 674.6, 2275.7, 7, 64.4, 438.6],
    ['/admin', 16, 685.1, 2305.2, 7, 64.4, 438.6],
    ['/admin/collections/articles', 16, 684.7, 2307.6, 7, 64.4, 438.6],
    ['/admin/collections/articles/create', 15, 674.9, 2275.9, 7, 64.4, 438.6],
    ['/admin/gallery (admins only)', 22, 798.5, 2672.3, 7, 64.4, 438.6],
  ],
}

/** Facts about CI that the run history alone can't show. */
export const ciNotes = {
  lastObserved: {
    sha: 'adff4e0',
    run: 39318049334,
    result: 'failure',
    detail:
      "Failed at “Admin Tailwind classes carry the acn prefix” (RunStatus tone 'running', restored by the revert); integration and e2e tests were skipped. The run has since been deleted.",
  },
}
