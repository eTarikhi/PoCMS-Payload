import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { GraphQL } from '@payloadcms/graphql/types'

// The email adapters (Resend, nodemailer) are imported where the provider is chosen, so a blank
// RESEND_API_KEY falls back to a log-only adapter instead of failing every send: see
// src/email/settings.ts and src/email/provider.ts. The examples below are kept as documentation
// of the alternatives.
// import nodemailerSendgrid from 'nodemailer-sendgrid'
// import nodemailer from 'nodemailer'

import path from 'path'
import { buildConfig, type Field } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { governedEntities, hasCapability } from './access/permissions'
import {
  presetAccess,
  presetConstraintOptions,
  presetConstraints,
  presetLabels,
} from './access/queryPresets'
import { recordAudit } from './audit/record'
import { checkSchema } from './lib/database-readiness'
import { migrations } from './migrations'
import { ensureRoles } from './access/roles'
import { createRoles } from './collections/Roles'
import { AuditLogs } from './collections/AuditLogs'
import { EmailLogs } from './collections/EmailLogs'
import { buildEmailAdapter } from './email/provider'
import { i18nConfig } from './i18n'
import { Footer } from './globals/Footer'
import { NavigationGlobal } from './globals/Navigation'
import { SiteSettings } from './globals/SiteSettings'

import { Users } from './collections/Users'
import { devGenerateEndpoint } from './endpoints/devGenerate'
import { jobsCancelEndpoint, jobsCronEndpoint, jobsRunEndpoint } from './endpoints/jobs'
import { devMigrateEndpoint } from './endpoints/devMigrate'
import { devTerminalEndpoint } from './endpoints/devTerminal'
import {
  emailStatusEndpoint,
  emailTemplatesEndpoint,
  emailTestEndpoint,
} from './endpoints/email'
import { devRestartEndpoint } from './endpoints/devRestart'
import { migrationStatusEndpoint } from './endpoints/migrationStatus'
import { purgePagesEndpoint } from './endpoints/purgePages'
import { resetBundlerCacheEndpoint } from './endpoints/resetBundlerCache'
import { revalidateSiteEndpoint } from './endpoints/revalidateSite'
import { About } from './collections/About'
import { Jobs } from './collections/Jobs'
import { PageSpeedReports } from './collections/PageSpeedReports'
import { Header } from './collections/Header'
import { Articles } from './collections/Articles'
import { Redirects } from './collections/Redirects'
import { Certificates } from './collections/Certificates'
import { Educations } from './collections/Educations'
import { Experiences } from './collections/Experiences'
import { Projects } from './collections/Projects'
import { Services } from './collections/Services'
import { Skills } from './collections/Skills'
import { Media } from './collections/Media'
import { dashboard } from './components/admin/widgets/config'
import { databaseTools } from './plugins/databaseTools'
import { adminUIPlugin } from './plugins/adminUI'
import { auditLogPlugin } from './plugins/auditLog'
import { seo } from './plugins/seo'

// import { MediaWithPrefix } from './collections/MediaWithPrefix'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Collections that hold site content, in sidebar order (see `collections` below). */
const contentCollections = [
  Articles,
  Projects,
  Media,
  About,
  Services,
  Skills,
  Experiences,
  Educations,
  Certificates,
  Header,
]

const globals = [Footer, NavigationGlobal, SiteSettings]

export default buildConfig({
  admin: {
    user: Users.slug,
    // Compact dates in lists, dashboards and document meta ("16 Oct 2026, 16:36").
    dateFormat: 'd MMM yyyy, HH:mm',
    // Initials on the design-system Avatar instead of Gravatar (no third-party request).
    avatar: { Component: '/components/admin/graphics/AccountAvatar#AccountAvatar' },
    meta: {
      titleSuffix: ' · PoCMS',
      description: 'PoCMS, the content admin for the eTarikhi portfolio.',
      icons: [
        { rel: 'icon', type: 'image/svg+xml', url: '/images/favicon/favicon.svg' },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          url: '/images/favicon/favicon-32x32.png',
        },
        { rel: 'apple-touch-icon', sizes: '180x180', url: '/images/favicon/apple-touch-icon.png' },
      ],
    },
    components: {
      // Admin design system: Inter, design tokens, Payload overrides, Tailwind (acn:*) utilities.
      providers: ['/components/admin/providers/AdminUIProvider#AdminUIProvider'],
      graphics: {
        Logo: '/components/admin/graphics/Logo#Logo',
        Icon: '/components/admin/graphics/Icon#Icon',
      },
      // Sidebar: a permission-aware "Create" menu on top; "View site" (and the gallery for admins) below.
      beforeNavLinks: [
        // Desktop sidebar collapse control (icon rail), at the top of the sidebar.
        '/components/admin/nav/SidebarToggle#SidebarToggle',
        '/components/admin/nav/QuickCreate#QuickCreate',
      ],
      afterNavLinks: ['/components/admin/nav/NavExtraLinks#NavExtraLinks'],
      // Log out is in the header account menu.
      logout: { Button: '/components/admin/nav/HiddenLogout#HiddenLogout' },
      // The one h1 on the two screens Payload renders without a heading (dashboard, sign-in).
      beforeDashboard: ['/components/admin/views/PageTitle#DashboardTitle'],
      beforeLogin: ['/components/admin/views/PageTitle#LoginTitle'],
      // Header: command menu (Ctrl+K / Cmd+K) and the light/dark switch.
      // (Payload renders the actions right to left, so the search button lands first.)
      actions: [
        // Account menu (replaces Payload's avatar link): account settings and log out.
        '/components/admin/actions/AccountMenu#AccountMenu',
        '/components/admin/actions/ThemeToggle#ThemeToggle',
        // Admins: GraphQL Playground and debugging links.
        '/components/admin/actions/DevTools#DevTools',
        '/components/admin/actions/CommandMenu#CommandMenuTrigger',
      ],
      views: {
        // Component gallery (admins only): every custom component above, live in Payload's shell.
        gallery: {
          Component: '/components/admin/views/Gallery#GalleryView',
          path: '/gallery',
          meta: { title: 'Component gallery' },
        },
        // Versions, integrations, database health and npm releases (E6, viewSystem capability).
        system: {
          Component: '/components/admin/views/System#SystemView',
          path: '/system',
          meta: { title: 'System' },
        },
        // Allow-listed package scripts with streamed output (E7). Development only.
        terminal: {
          Component: '/components/admin/views/Terminal#TerminalView',
          path: '/terminal',
          meta: { title: 'Terminal' },
        },
        // Scheduled maintenance (manageJobs): tasks, Run now, the runs and their outcomes.
        jobs: {
          Component: '/components/admin/views/Jobs#JobsView',
          path: '/jobs',
          meta: { title: 'Scheduled jobs' },
        },
        // Delivery, templates and the send log (manageEmails).
        email: {
          Component: '/components/admin/views/Email#EmailView',
          path: '/email',
          meta: { title: 'Email' },
        },
      },
    },
    // Dashboard widgets (P4): welcome, content health, counts, publishing chart, recent changes.
    dashboard,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  // Order sets the sidebar order of the admin.group sections: Content, Profile, Site settings,
  // Admin. Profile follows the section order of the public home page. Payload lists collections
  // before globals, so the Footer global joins Site settings after the Header collection.
  // Roles get an access-level row for every governed collection and global (ADR 0011).
  collections: [
    ...contentCollections,
    Redirects,
    Users,
    createRoles(governedEntities({ collections: contentCollections, globals })),
    // Admin data with no document UI of its own: job runs (/admin/jobs) and the stored Lighthouse
    // reports the Page speed widget reads (CR-12 E4, E4b).
    Jobs,
    PageSpeedReports,
    // Append-only audit trail (E5). Read with the viewAuditLog capability; never governed by roles.
    AuditLogs,
    // Every send the email adapter attempted, with the same shape of guard: written by the wrapper
    // around the provider, read with the manageEmails capability, never by hand.
    EmailLogs,
  ],
  globals,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  // Media folders (Payload's beta folders feature, enabled per collection in src/collections/Media.ts).
  // Only Media uses folders, so the folder drawer hides Payload's "Folder Type" select and defaults
  // it to Media: with one type there is nothing to choose, and a folder saved from the UI still
  // gets a type. If a second collection enables folders, drop `hidden` to bring the scoping back.
  folders: {
    collectionOverrides: [
      ({ collection }) => ({
        ...collection,
        fields: collection.fields.map((field) =>
          'name' in field && field.name === 'folderType'
            ? ({ ...field, defaultValue: ['media'], admin: { ...field.admin, hidden: true } } as Field)
            : field,
        ),
      }),
    ],
  },
  // Saved views (Payload's query presets): the collections listed in src/access/queryPresets.ts get a
  // control that stores a list view's filters, columns and sort order as a document, so a view like
  // "Unpublished articles" or "Failed email this week" survives the session and can be shared. The
  // views live in Payload's own hidden collection; what is configured here is who may use them.
  // Collection-level access *replaces* Payload's default instead of extending it, so it states the
  // signed-in requirement itself, and per-view sharing (only me / everyone / specific users /
  // specific roles) decides the rest.
  queryPresets: {
    access: presetAccess,
    constraints: presetConstraints,
    filterConstraints: presetConstraintOptions,
    labels: presetLabels,
  },
  // Our own admin strings, under the `custom` namespace (src/i18n/en.ts). Payload's interface
  // translations stay as shipped; a second language only needs a new file and an entry here.
  i18n: i18nConfig,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
    // Generated files are written only by `pnpm generate:all` (scripts/generate.mjs), so local runs
    // without a Blob token no longer rewrite them in a different shape. CI checks they are current.
    autoGenerate: false,
  },
  db: vercelPostgresAdapter({
    pool: {
      connectionString: process.env.POSTGRES_URL || '',
    },
    // Schema changes go through `src/migrations` only. Development push used to create the schema
    // from the config on every start, which meant a database's real shape depended on who ran what:
    // migrations could then fail on columns that already existed, and a deploy built from a
    // different commit could push a schema nobody reviewed. `pnpm migrate` is now the only writer,
    // and CI runs it before seeding (`docs/development.md`).
    push: false,
  }),
  // storage: [
  //   vercelBlobStorage({
  //     collections: {
  //       media: true,
  //     },
  //     token: process.env.BLOB_READ_WRITE_TOKEN || '',
  //   }),
  // ],
  sharp,
  // Custom REST endpoints (under /api).
  endpoints: [
    revalidateSiteEndpoint,
    purgePagesEndpoint,
    migrationStatusEndpoint,
    // Scheduled maintenance: manual runs, cancel, and the Vercel Cron entry point (CRON_SECRET).
    jobsRunEndpoint,
    jobsCancelEndpoint,
    jobsCronEndpoint,
    // Development only (they return 404 in production).
    // The email page: provider status, template previews and a test send (manageEmails).
    emailStatusEndpoint,
    emailTemplatesEndpoint,
    emailTestEndpoint,
    devTerminalEndpoint,
    resetBundlerCacheEndpoint,
    devGenerateEndpoint,
    devMigrateEndpoint,
    devRestartEndpoint,
  ],
  onInit: async (payload) => {
    // Say what is wrong before the first query does. With push off, an unmigrated database answers
    // every request with Drizzle's raw "Failed query: select … from users" and the real cause
    // (`relation "users" does not exist`) only appears in the log; the message below names the
    // command to run instead.
    const schema = await checkSchema(
      payload,
      migrations.map((migration) => migration.name),
    )
    // A database with no schema, only part of one, or none reachable at all cannot serve a single
    // page: stop with the message instead of letting every request answer with Drizzle's SQL. A
    // schema that is merely behind only gets a warning, so a stale column does not take the site
    // down.
    if (schema.state === 'missing' || schema.state === 'partial' || schema.state === 'unreachable') {
      payload.logger.error(schema.message)
      throw new Error(schema.message)
    }
    if (schema.state !== 'ready') payload.logger.warn(schema.message)

    // Roles (ADR 0011): built-in roles, the one-time move from the old select, never no admin.
    await ensureRoles(payload)
  },
  plugins: [
    vercelBlobStorage({
      enabled: true,
      collections: {
        media: true,
        // 'media-with-prefix': {
        //   prefix: 'media',
        // },
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
    // SEO metadata on articles and site settings (the `meta` group + its admin preview).
    seo,
    // Records changes to every collection and global (E5), before the admin UI plugin maps them.
    auditLogPlugin(),
    // Tables, backup, restore, maintenance and Neon branches at /admin/database, with its own
    // endpoints and sidebar link. The plugin brings the mechanics; this app supplies what only it
    // knows: which capability gates it, where the audit log is, and which migrations to expect.
    databaseTools({
      access: ({ req }) => hasCapability(req.user, 'manageDatabase'),
      // The sidebar has the user but no request, so the link repeats the same rule against the user.
      navigation: { visible: ({ user }) => hasCapability(user, 'manageDatabase') },
      audit: ({ payload, req, summary, changes }) =>
        recordAudit(
          payload,
          {
            action: 'update',
            summary,
            entity: 'database',
            entityLabel: 'Database',
            entityKind: 'global',
            changes,
          },
          req,
        ),
      migrations: migrations.map((migration) => migration.name),
    }),
    // Last, so it sees every field other plugins add: TanStack list views, boolean cells (ADR 0007).
    adminUIPlugin(),
  ],
  graphQL: {
    validationRules: () => [NoProductionIntrospection],
    disablePlaygroundInProduction: false,
  },

  // email: nodemailerAdapter({
  //   defaultFromAddress: 'info@payloadcms.com',
  //   defaultFromName: 'Payload',
  //   // Nodemailer transportOptions
  //   transportOptions: {
  //     host: process.env.SMTP_HOST,
  //     port: 587,
  //     auth: {
  //       user: process.env.SMTP_USER,
  //       pass: process.env.SMTP_PASS,
  //     },
  //   },
  // }),

  // email: nodemailerAdapter({
  //   defaultFromAddress: 'info@payloadcms.com',
  //   defaultFromName: 'Payload',
  //   // Any Nodemailer transport can be used
  //   transport: nodemailer.createTransport({
  //     host: process.env.SMTP_HOST,
  //     port: 587,
  //     auth: {
  //       user: process.env.SMTP_USER,
  //       pass: process.env.SMTP_PASS,
  //     },
  //   }),
  // }),

  // email: nodemailerAdapter({
  //   defaultFromAddress: 'info@payloadcms.com',
  //   defaultFromName: 'Payload',
  //   transportOptions: nodemailerSendgrid({
  //     apiKey: process.env.SENDGRID_API_KEY,
  //   }),
  // }),

  // Which provider sends, whether it can, and the wrapper that logs every attempt: see
  // src/email/settings.ts and provider.ts. Resend when RESEND_API_KEY is set (a REST call, which is
  // what a serverless
  // function wants), SMTP when SMTP_HOST is, and a log-only adapter when neither is — with the
  // reason on /admin/email rather than in a startup warning nobody reads.
  email: buildEmailAdapter(),
})

const NoProductionIntrospection: GraphQL.ValidationRule = (context) => ({
  Field(node) {
    if (process.env.NODE_ENV === 'production') {
      if (node.name.value === '__schema' || node.name.value === '__type') {
        context.reportError(
          new GraphQL.GraphQLError(
            'GraphQL introspection is not allowed, but the query contained __schema or __type',
            { nodes: [node] },
          ),
        )
      }
    }
  },
})
