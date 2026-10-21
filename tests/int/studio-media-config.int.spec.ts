import { describe, expect, it } from 'vitest'
import { mediaRemotePatterns } from '@/utilities/media-origins'

describe('Remote media allowlist', () => {
  it('supports public Vercel Blob media without allowing arbitrary hosts or query strings', () => {
    expect(mediaRemotePatterns()).toEqual([
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
        search: '',
      },
    ])
  })
  it('normalizes and deduplicates explicit HTTPS origins', () => {
    const patterns = mediaRemotePatterns(
      ' https://CDN.example.com, https://cdn.example.com/, https://images.example.com ',
    )
    expect(patterns).toHaveLength(3)
    expect(patterns[1]).toEqual({
      protocol: 'https',
      hostname: 'cdn.example.com',
      port: '',
      pathname: '/**',
      search: '',
    })
  })
  it.each([
    'http://cdn.example.com',
    'https://user:secret@cdn.example.com',
    'https://cdn.example.com/image',
    'https://cdn.example.com?token=secret',
    'https://cdn.example.com#fragment',
    'https://cdn.example.com:8080',
    'https://*.example.com',
    'https://localhost',
    'not-an-origin',
  ])('rejects an unsafe or ambiguous source: %s', (origin) => {
    expect(() => mediaRemotePatterns(origin)).toThrow('Invalid MEDIA_REMOTE_ORIGINS')
    try {
      mediaRemotePatterns(origin)
    } catch (error) {
      expect((error as Error).message).not.toContain('secret')
    }
  })
})
