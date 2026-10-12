import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { GraphQL } from '@payloadcms/graphql/types'

import { nodemailerAdapter } from '@payloadcms/email-nodemailer' // eslint-disable-line @typescript-eslint/no-unused-vars -- kept for the commented SMTP examples below
import { resendAdapter } from '@payloadcms/email-resend'
// import nodemailerSendgrid from 'nodemailer-sendgrid'
// import nodemailer from 'nodemailer'

import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Footer } from './globals/Footer'

import { Users } from './collections/Users'
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

// import { MediaWithPrefix } from './collections/MediaWithPrefix'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' – PoCMS',
      description: 'PoCMS portfolio content management.',
      icons: [
        { url: '/images/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/images/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      ],
    },
    // Compact, readable dates everywhere in the admin (list columns, activity, etc.).
    dateFormat: 'd MMM yyyy',
    components: {
      graphics: {
        Icon: '/admin/graphics/Icon.tsx',
        Logo: '/admin/graphics/Logo.tsx',
      },
      actions: ['/admin/nav/HeaderViewSiteButton.tsx'],
      header: ['/admin/brand/AdminFonts.tsx'],
      afterNavLinks: ['/admin/nav/ViewSiteLink.tsx'],
      settingsMenu: ['/admin/nav/RefreshCacheButton.tsx'],
    },
    dashboard: {
      widgets: [
        {
          slug: 'content-overview',
          Component: '/admin/dashboard/widgets/ContentOverview.tsx',
          label: 'Content overview',
          minWidth: 'medium',
          maxWidth: 'full',
          fields: [
            {
              name: 'title',
              type: 'text',
              defaultValue: 'Content overview',
              admin: { description: 'Heading shown on the widget.' },
            },
            {
              name: 'shown',
              type: 'select',
              hasMany: true,
              defaultValue: ['articles', 'projects', 'media', 'certificates', 'experiences', 'skills'],
              options: [
                { label: 'Articles', value: 'articles' },
                { label: 'Projects', value: 'projects' },
                { label: 'Media', value: 'media' },
                { label: 'Certificates', value: 'certificates' },
                { label: 'Experience', value: 'experiences' },
                { label: 'Skills', value: 'skills' },
              ],
              admin: { description: 'Which collections to count on your dashboard.' },
            },
          ],
        },
        {
          slug: 'quick-actions',
          Component: '/admin/dashboard/widgets/QuickActions.tsx',
          label: 'Quick actions',
          minWidth: 'x-small',
          maxWidth: 'medium',
        },
        {
          slug: 'recent-activity',
          Component: '/admin/dashboard/widgets/RecentActivity.tsx',
          label: 'Recent activity',
          minWidth: 'medium',
          maxWidth: 'full',
        },
        {
          slug: 'needs-attention',
          Component: '/admin/dashboard/widgets/NeedsAttention.tsx',
          label: 'Needs attention',
          minWidth: 'medium',
          maxWidth: 'full',
        },
      ],
      defaultLayout: [
        {
          widgetSlug: 'content-overview',
          width: 'large',
          data: {
            title: 'Content overview',
            shown: ['articles', 'projects', 'media', 'certificates', 'experiences', 'skills'],
          },
        },
        { widgetSlug: 'quick-actions', width: 'small' },
        { widgetSlug: 'recent-activity', width: 'medium' },
        { widgetSlug: 'needs-attention', width: 'medium' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
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
  collections: [
    // Content-first ordering shapes the admin nav groups and dashboard cards.
    Articles,
    Projects,
    Media,
    About,
    Header,
    Experiences,
    Educations,
    Skills,
    Services,
    Certificates,
    Users,
  ],
  globals: [Footer],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
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
