# Project structure

```text
PoCMS-Payload/
├── src/
│   ├── collections/          # Payload collections (content types)
│   ├── blocks/               # Reusable content blocks
│   ├── endpoints/            # Custom API endpoints
│   ├── payload.config.ts     # Payload CMS configuration
│   └── server.ts             # Server setup
├── tests/                    # Test suite
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
