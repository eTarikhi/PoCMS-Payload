import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { GraphQL } from '@payloadcms/graphql/types'
import { en } from '@payloadcms/translations/languages/en'
import { fa } from '@payloadcms/translations/languages/fa'

import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { resendAdapter } from '@payloadcms/email-resend'
// import nodemailerSendgrid from 'nodemailer-sendgrid'
// import nodemailer from 'nodemailer'

import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Footer } from './globals/Footer'
import { DEFAULT_LOCALE, PAYLOAD_LOCALES } from './i18n/locales'
import { migrations } from './migrations'

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
    Users,
    About,
    Header,
    Articles,
    Certificates,
    Educations,
    Experiences,
    Projects,
    Services,
    Skills,
    Media,
  ],
  globals: [Footer],
  /**
   * Editorial content is English-first, with Persian translations available per localized field.
   * Persian falls back to English only while a translation is incomplete; public locale routing will
   * make that fallback explicit in the next implementation step.
   */
  localization: {
    locales: PAYLOAD_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    fallback: true,
  },
  /** Payload Admin UI language support is independent from editorial-content localization. */
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { en, fa },
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: vercelPostgresAdapter({
    pool: {
      connectionString: process.env.POSTGRES_URL || '',
    },
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
    // Existing deployments are migrated explicitly; never let a dev boot mutate this schema.
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
