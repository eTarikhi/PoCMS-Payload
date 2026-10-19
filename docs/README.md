# Documentation

This repository is organized into a small set of topic-based guides. Use the pages below to navigate the project quickly.

## Start here

- [Overview](overview.md) — key features, architecture, and stack
- [Getting started](getting-started.md) — install, configure, and run locally
- [Project structure](project-structure.md) — code layout and content collections

## Reference and operations

- [API reference](api.md) — REST and GraphQL usage
- [Deployment](deployment.md) — Docker, Vercel, and production setup
- [Development and troubleshooting](development.md) — common issues and workflows
- [Contributing](contributing.md) — contribution guidelines and support

## Admin UI

- [Admin UI guide](ui-modernization/admin-ui-guide.md) — structure by Payload slot, adding components, tokens, Tailwind `acn:` prefix, dashboard widgets, list views, roles
- [Admin components](../src/components/admin/README.md) — every custom component, the folder layout and its conventions; live at `/admin/gallery`
- [Decision records](ui-modernization/adr/README.md) — why Base UI, the prefix, Inter, Payload 3.9x, TanStack Table, roles, the component layout
- [Dashboard integrations](ui-modernization/dashboard-integrations.md) — research: Vercel Analytics, page speed and search reports on the dashboard; proposed admin tools
- [Performance budget](ui-modernization/perf-budget.md) — admin bundle baseline, budget and current numbers
- [Analysis and roadmap](ui-modernization/shadcn-payload-ui-analysis.md) — the original review and phased plan
- Screenshots: [before](ui-modernization/screenshots/p0-baseline/) and [after](ui-modernization/screenshots/p6-after/) (same pages, themes and widths)

## Progress reports

- [Progress reports](reports/README.md) — dated development reports with charts (timeline, velocity, burn-down, forecast, roadmap alignment) and the data behind them

## Root project files

- [README](../README.md)
- [AGENTS.md](../AGENTS.md) — rules for coding agents
- [PAYLOAD.md](../PAYLOAD.md)
- [docker-compose.yml](../docker-compose.yml)
- [package.json](../package.json)
- [LICENSE](../LICENSE)
