import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { SECURITY_HEADERS } from './src/lib/security'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Dev-only indicator: bottom right, so it doesn't cover the admin sidebar's account controls.
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...SECURITY_HEADERS],
      },
    ]
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
      {
        // Static assets from public/images (vTarikhi portfolio). Without this entry,
        // next/image rejects them once localPatterns is set (see migration analysis F-02).
        pathname: '/images/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
  // Extra dev origins (comma-separated hostnames, wildcards allowed), e.g. a tunnel or a cloud IDE
  // preview host: DEV_ALLOWED_ORIGINS="*.example.dev". Development only; ignored by `next build`.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    ...(process.env.DEV_ALLOWED_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ],
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
