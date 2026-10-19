# Project structure

```text
PoCMS-Payload/
├── src/
│   ├── app/
│   │   ├── (frontend)/       # Public portfolio site (Next.js App Router, Bootstrap)
│   │   └── (payload)/        # Payload admin and API routes (generated; importMap.js is generated)
│   ├── collections/          # Payload collections (content types)
│   ├── globals/              # Payload globals
│   ├── components/admin/     # Admin custom components, one folder per Payload slot (see its README)
│   │   ├── actions/          #   header actions: command menu, dev tools, theme, account menu
│   │   ├── elements/         #   building blocks (Base UI): Button, Card, Table, …
│   │   ├── fields/           #   field components: Field and Cell
│   │   ├── graphics/         #   logo, icon, account avatar
│   │   ├── nav/              #   sidebar additions
│   │   ├── providers/        #   admin providers (loads the admin stylesheet)
│   │   ├── views/            #   custom views: component gallery, list view, singleton list
│   │   ├── widgets/          #   dashboard widgets and their config
│   │   └── hooks/, utilities/
│   ├── styles/admin/         # Admin design tokens, Tailwind entry, Payload overrides
│   ├── plugins/              # Config plugins (adminUI: list view, list summary, cells)
│   ├── access/               # Roles and permissions (ADR 0011), singleton create access
│   ├── endpoints/            # Custom API endpoints
│   ├── fields/               # Shared field definitions
│   ├── seed/                 # Seed script and data
│   ├── payload-types.ts      # Generated types (pnpm generate:all)
│   └── payload.config.ts     # Payload CMS configuration
├── docs/                     # Project and admin UI documentation
├── scripts/                  # Code generation and checks (generate, nav icons, contrast, prefix)
├── tests/                    # Vitest integration and Playwright e2e tests
├── Dockerfile                # Production container
├── docker-compose.yml        # Local Docker setup
├── PAYLOAD.md                # Payload-specific notes
├── README.md                 # Project landing page
├── package.json              # Scripts and dependencies
├── pnpm-lock.yaml            # Lockfile
├── tsconfig.json             # TypeScript config
├── vitest.config.mts         # Test config
├── vitest.setup.ts           # Vitest setup
├── LICENSE                   # License file
├── .env.example              # Example environment file
└── .gitignore
```

## Collections and content models

The CMS is configured around modular collections such as:

### Users

- admin user management
- role-based access control
- auth flows
- session management

### Media

- uploads
- image management
- optimization and resizing
- media storage integration

### Portfolio projects

This repository is structured to support portfolio content such as:

- project summaries
- case studies
- skill references
- technology tags
- contact information

## Payload configuration

The main Payload setup is usually found in the `src` directory, most notably the configuration and collection definitions. These determine:

- available collections
- schema and field types
- admin UI behavior
- API endpoints and hooks
- database and media integrations

## Admin UI

The admin is Payload's own, customised through the extension points its documentation describes.
The layout of `src/components/admin` follows those extension points; see
[`src/components/admin/README.md`](../src/components/admin/README.md) and the
[admin UI guide](./ui-modernization/admin-ui-guide.md). Signed in as an admin, `/admin/gallery`
shows every custom component live.
