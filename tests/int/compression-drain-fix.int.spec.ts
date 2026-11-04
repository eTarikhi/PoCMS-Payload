// @vitest-environment node
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import type { Socket } from 'node:net'
import path from 'node:path'
import type { Duplex } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { installCompressionDrainFix } from '@/lib/fixCompressionDrainListeners'

const require = createRequire(import.meta.url)

function createMockCompressedResponse() {
  const setupCompression = require('next/dist/compiled/compression') as () => (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void,
  ) => void
  const compress = setupCompression()

  const req = new http.IncomingMessage(null as unknown as Socket)
  req.method = 'GET'
  req.headers = { 'accept-encoding': 'gzip' }

  const res = new http.ServerResponse(req)
  res.assignSocket({
    writable: true,
    write: () => false,
    on: () => {},
    once: () => {},
    removeListener: () => {},
    destroy: () => {},
    cork: () => {},
    uncork: () => {},
  } as unknown as Socket)
  res.setHeader('Content-Type', 'application/javascript')

  compress(req, res, () => {})
  return res
}

function getUnderlyingGzipStream(res: http.ServerResponse): Duplex {
  const noop = () => {}
  const target = res.on('drain', noop) as unknown as Duplex
  target.removeListener('drain', noop)
  return target
}

describe('Compression [Gzip] drain listener fix', () => {
  it('installs idempotently and removes res.once("drain") listeners from [Gzip] without MaxListenersExceededWarning', async () => {
    installCompressionDrainFix()
    // Subsequent calls are safe no-ops
    expect(installCompressionDrainFix()).toBe(false)

    const warnings: Error[] = []
    const onWarning = (warning: Error) => {
      warnings.push(warning)
    }
    process.on('warning', onWarning)

    try {
      const res = createMockCompressedResponse()

      // Pre-header-flush listeners buffered by compression middleware
      let firedCount = 0
      for (let i = 0; i < 4; i++) {
        const chained = res.once('drain', () => {
          firedCount += 1
        })
        expect(chained).toBe(res)
      }

      // Trigger header flush + zlib.createGzip() creation (> 1024 byte threshold)
      res.write(Buffer.alloc(2048, 'a'))

      const gzip = getUnderlyingGzipStream(res)
      expect(gzip).not.toBe(res)

      gzip.emit('drain')
      expect(firedCount).toBe(4)
      expect(gzip.listenerCount('drain')).toBe(0)

      // Simulate 30 backpressure pause/resume cycles (far exceeding default MaxListeners = 10)
      for (let i = 0; i < 30; i++) {
        const chained = res.once('drain', () => {
          firedCount += 1
        })
        expect(chained).toBe(res)
        expect(gzip.listenerCount('drain')).toBe(1)
        gzip.emit('drain')
        expect(gzip.listenerCount('drain')).toBe(0)
      }

      expect(firedCount).toBe(34)

      // Explicit res.off('drain', fn) before drain fires detaches from [Gzip]
      let cancelledCalled = false
      const cancelledListener = () => {
        cancelledCalled = true
      }
      res.once('drain', cancelledListener)
      expect(gzip.listenerCount('drain')).toBe(1)
      res.off('drain', cancelledListener)
      expect(gzip.listenerCount('drain')).toBe(0)
      gzip.emit('drain')
      expect(cancelledCalled).toBe(false)

      // Next.js's releaseCompressionStream remains compatible on early close
      const { releaseCompressionStream } = require(
        'next/dist/server/lib/release-compression-stream',
      ) as { releaseCompressionStream: (response: http.ServerResponse) => void }
      releaseCompressionStream(res)
      expect(gzip.destroyed).toBe(true)

      // Flush one macrotask so Node's asynchronous process.emitWarning (if any) would fire
      await new Promise((resolve) => setImmediate(resolve))
      const maxListenerWarnings = warnings.filter(
        (w) => w.name === 'MaxListenersExceededWarning',
      )
      expect(maxListenerWarnings).toHaveLength(0)
    } finally {
      process.off('warning', onWarning)
    }
  })

  it('disables redundant Next.js compression middleware in development in next.config.ts', () => {
    const nextConfigSrc = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(nextConfigSrc).toContain("compress: process.env.NODE_ENV !== 'development'")
    expect(nextConfigSrc).toContain('installCompressionDrainFix()')
  })
})
