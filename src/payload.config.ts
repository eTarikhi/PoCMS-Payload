import { buildConfig } from 'payload/config';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';

const postgresUrl =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  '';

export default buildConfig({
  admin: {
    user: 'users',
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      admin: {
        useAsTitle: 'email',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
        },
      ],
    },
    {
      slug: 'portfolio-items',
      admin: {
        useAsTitle: 'title',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
        },
        {
          name: 'content',
          type: 'richText',
        },
      ],
    },
  ],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: postgresUrl,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
    },
  }),
  secret: process.env.PAYLOAD_SECRET || 'replace-me-with-a-strong-secret',
  typescript: {
    outputFile: './src/payload-types.ts',
  },
});
