import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { GraphQL } from '@payloadcms/graphql/types'

import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { resendAdapter } from '@payloadcms/email-resend'
// import nodemailerSendgrid from 'nodemailer-sendgrid'
// import nodemailer from 'nodemailer'

import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { ensureOrderable } from './access/orderable'
import { governedEntities } from './access/permissions'
import { ensureRoles } from './access/roles'
import { AuditLogs } from './collections/AuditLogs'
import { createRoles } from './collections/Roles'
import { Footer } from './globals/Footer'
import { Navigation } from './globals/Navigation'
import { SiteSettings } from './globals/SiteSettings'

import { Users } from './collections/Users'
import { devGenerateEndpoint } from './endpoints/devGenerate'
import { devMigrateEndpoint } from './endpoints/devMigrate'
import { devRestartEndpoint } from './endpoints/devRestart'
import { migrationStatusEndpoint } from './endpoints/migrationStatus'
import { purgePagesEndpoint } from './endpoints/purgePages'
import { resetBundlerCacheEndpoint } from './endpoints/resetBundlerCache'
import { revalidateSiteEndpoint } from './endpoints/revalidateSite'
import { About } from './collections/About'
import { Header } from './collections/Header'
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

// import { MediaWithPrefix } from './collections/MediaWithPrefix'

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
  Header,
]

const globals = [SiteSettings, Navigation, Footer]

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
    Users,
    createRoles(governedEntities({ collections: contentCollections, globals })),
    AuditLogs,
  ],
  globals,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
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
    // Development only (they return 404 in production).
    resetBundlerCacheEndpoint,
    devGenerateEndpoint,
    devMigrateEndpoint,
    devRestartEndpoint,
  ],
  // Roles (ADR 0011) and orderable collections: built-in roles, legacy migration, and _order keys.
  onInit: async (payload) => {
    await ensureRoles(payload)
    await ensureOrderable(payload)
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
    auditLogPlugin(),
    // Last, so it sees every field other plugins add: TanStack list views, boolean cells (ADR 0007).
    adminUIPlugin(),
  ],
  graphQL: {
    validationRules: (args) => [NoProductionIntrospection],
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
