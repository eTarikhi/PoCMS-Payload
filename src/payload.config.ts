import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { GraphQL } from '@payloadcms/graphql/types'

import { resendAdapter } from '@payloadcms/email-resend'

import path from 'path'
import { buildConfig, type Config } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { ensureDraftVersions } from './access/draftMigration'
import { ensureOrderable } from './access/orderable'
import { governedEntities } from './access/permissions'
import { ensureRoles } from './access/roles'
import { ensureDefaultForms } from './seed/ensureForms'
import { AuditLogs } from './collections/AuditLogs'
import { createRoles } from './collections/Roles'
import { CustomCode } from './globals/CustomCode'
import { Footer } from './globals/Footer'
import { Header } from './globals/Header'
import { Navigation } from './globals/Navigation'
import { SiteSettings } from './globals/SiteSettings'

import { Users } from './collections/Users'
import { adminJobsEndpoints } from './endpoints/adminJobs'
import { adminVersionsEndpoints } from './endpoints/adminVersions'
import { draftPreviewEndpoint, exitDraftPreviewEndpoint } from './endpoints/draftPreview'
import { devGenerateEndpoint } from './endpoints/devGenerate'
import { devMigrateEndpoint } from './endpoints/devMigrate'
import { devRestartEndpoint } from './endpoints/devRestart'
import { devTerminalEndpoint } from './endpoints/devTerminal'
import { migrationStatusEndpoint } from './endpoints/migrationStatus'
import { mediaFrameEndpoint, publicImagesEndpoint } from './endpoints/publicImages'
import { purgePagesEndpoint } from './endpoints/purgePages'
import { resetBundlerCacheEndpoint } from './endpoints/resetBundlerCache'
import { revalidateSiteEndpoint } from './endpoints/revalidateSite'
import { systemInfoEndpoint } from './endpoints/systemInfo'
import { createJobsConfig } from './jobs/config'
import { resolvePayloadSecret } from './lib/security'
import { About } from './collections/About'
import { Articles } from './collections/Articles'
import { Certificates } from './collections/Certificates'
import { Educations } from './collections/Educations'
import { Experiences } from './collections/Experiences'
import { Projects } from './collections/Projects'
import { Services } from './collections/Services'
import { Skills } from './collections/Skills'
import { Media } from './collections/Media'
import { dashboard } from './components/admin/widgets/config'
import { adminUIPlugin } from './plugins/adminUI'
import { auditLogPlugin } from './plugins/auditLog'
import { databaseManagerPlugin } from './plugins/databaseManager'
import {
  FORM_SUBMISSIONS_COLLECTION,
  FORMS_COLLECTION,
  portfolioFormBuilderPlugin,
} from './plugins/formBuilder'
import {
  MAIL_ATTACHMENTS_COLLECTION,
  mailInboxPlugin,
} from './plugins/mailInbox'
import {
  portfolioRedirectsPlugin,
  portfolioSeoPlugin,
  REDIRECTS_COLLECTION,
} from './plugins/seoAndRedirects'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Collections that hold site content, in sidebar order (see `collections` below). */
const contentCollections = [
  Articles,
  Projects,
  Media,
  About,
  Experiences,
  Educations,
  Certificates,
  Services,
  Skills,
]

const globals = [Header, SiteSettings, Navigation, Footer, CustomCode]

/** Includes plugin-registered collections (`redirects`, `forms`, `form-submissions`) so RBAC role fields match `payload.config`. */
const roleGovernedCollections = [
  ...contentCollections,
  {
    slug: FORMS_COLLECTION,
    labels: { plural: 'Forms' },
    admin: { group: 'Content' },
  },
  {
    slug: FORM_SUBMISSIONS_COLLECTION,
    labels: { plural: 'Submissions' },
    admin: { group: 'Content' },
  },
  {
    slug: REDIRECTS_COLLECTION,
    labels: { plural: 'Redirects' },
    admin: { group: 'Site settings' },
  },
]

const extractUserRoleIds = (user: unknown): (number | string)[] => {
  if (!user || typeof user !== 'object') return []
  const rawRoles = (user as { roles?: unknown[] }).roles
  if (!Array.isArray(rawRoles)) return []
  return rawRoles
    .map((r) =>
      typeof r === 'number' || typeof r === 'string'
        ? r
        : r && typeof r === 'object' && 'id' in r
          ? (r as { id: number | string }).id
          : null,
    )
    .filter((id): id is number | string => id !== null)
}

type RolePresetConstraint = NonNullable<
  NonNullable<NonNullable<Config['queryPresets']>['constraints']>['read']
>[number]

const buildRolePresetConstraint = (
  operation: 'read' | 'update' | 'delete',
): RolePresetConstraint => ({
  label: 'Specific Roles',
  value: 'specificRoles',
  fields: [
    {
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      required: true,
    },
  ],
  access: ({ req: { user } }) => {
    const roleIds = extractUserRoleIds(user)
    if (roleIds.length === 0) return false
    return {
      [`access.${operation}.roles`]: {
        in: roleIds,
      },
    }
  },
})

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
        system: {
          Component: '/components/admin/views/System#SystemView',
          path: '/system',
          meta: { title: 'System information' },
        },
        jobs: {
          Component: '/components/admin/views/Jobs#JobsView',
          path: '/jobs',
          meta: { title: 'Scheduled jobs' },
        },
        terminal: {
          Component: '/components/admin/views/Terminal#TerminalView',
          path: '/terminal',
          meta: { title: 'Dev terminal' },
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
  // Hierarchical asset organization (`Media.folders = true`).
  folders: {
    browseByFolder: true,
    collectionOverrides: [
      ({ collection }) => ({
        ...collection,
        access: {
          read: ({ req }) => Boolean(req.user),
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
        },
      }),
    ],
  },
  // Saved filter/sort/column presets on `Articles`, `Projects`, `Media`, and `AuditLogs`,
  // supporting personal presets, global presets, specific users, and RBAC `Roles`.
  queryPresets: {
    access: {
      read: ({ req }) => Boolean(req.user),
      create: ({ req }) => Boolean(req.user),
      update: ({ req }) => Boolean(req.user),
      delete: ({ req }) => Boolean(req.user),
    },
    constraints: {
      read: [buildRolePresetConstraint('read')],
      update: [buildRolePresetConstraint('update')],
      delete: [buildRolePresetConstraint('delete')],
    },
  },
  // Order sets the sidebar order of the admin.group sections: Content, Profile, Site settings,
  // Admin. Profile follows the section order of the public home page. Payload lists collections
  // before globals, so the Footer global joins Site settings after the Header collection.
  // Roles get an access-level row for every governed collection and global (ADR 0011).
  collections: [
    ...contentCollections,
    Users,
    createRoles(governedEntities({ collections: roleGovernedCollections, globals })),
    AuditLogs,
  ],
  globals,
  editor: lexicalEditor(),
  secret: resolvePayloadSecret(),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
    // Generated files are written only by `pnpm generate:all` (scripts/generate.mjs), so local runs
    // without a Blob token no longer rewrite them in a different shape. CI checks they are current.
    autoGenerate: false,
  },
  db: vercelPostgresAdapter({
    // Skip interactive drizzle-kit schema introspection/prompts during automated Vitest runs
    // (`NODE_ENV === 'test'`) unless explicitly requested via `PAYLOAD_DB_PUSH=true`.
    push: process.env.NODE_ENV === 'test' ? process.env.PAYLOAD_DB_PUSH === 'true' : undefined,
    pool: {
      connectionString: process.env.POSTGRES_URL || '',
    },
  }),
  sharp,
  jobs: createJobsConfig(),
  // Custom REST endpoints (under /api).
  endpoints: [
    draftPreviewEndpoint,
    exitDraftPreviewEndpoint,
    revalidateSiteEndpoint,
    purgePagesEndpoint,
    migrationStatusEndpoint,
    systemInfoEndpoint,
    publicImagesEndpoint,
    mediaFrameEndpoint,
    ...adminJobsEndpoints,
    ...adminVersionsEndpoints,
    // Development only (they return 404 in production).
    resetBundlerCacheEndpoint,
    devGenerateEndpoint,
    devMigrateEndpoint,
    devRestartEndpoint,
    devTerminalEndpoint,
  ],
  // Roles (ADR 0011), orderable collections, and pre-draft version snapshots on existing rows.
  onInit: async (payload) => {
    await ensureRoles(payload)
    await ensureOrderable(payload)
    await ensureDraftVersions(payload)
    await ensureDefaultForms(payload)
  },
  plugins: [
    portfolioSeoPlugin(),
    portfolioRedirectsPlugin(),
    portfolioFormBuilderPlugin(),
    mailInboxPlugin({
      bridgeFormSubmissions: true,
    }),
    vercelBlobStorage({
      // Only activate live Vercel Blob storage when BLOB_READ_WRITE_TOKEN is configured;
      // `alwaysInsertFields: true` keeps database/TypeScript/GraphQL schemas identical in local dev,
      // and `clientUploads: true` bypasses serverless 4.5 MB request body limits in production.
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      alwaysInsertFields: true,
      clientUploads: true,
      collections: {
        media: true,
        [MAIL_ATTACHMENTS_COLLECTION]: {
          prefix: 'mail-attachments',
        },
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
    auditLogPlugin(),
    databaseManagerPlugin(),
    // Last, so it sees every field other plugins add: TanStack list views, boolean cells (ADR 0007).
    adminUIPlugin(),
  ],
  graphQL: {
    validationRules: () => [NoProductionIntrospection],
    disablePlaygroundInProduction: true,
  },
  email: resendAdapter({
    defaultFromAddress: 'dev@vtarikhi.com',
    defaultFromName: 'PoCMS',
    apiKey: process.env.RESEND_API_KEY || '',
  }),
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
