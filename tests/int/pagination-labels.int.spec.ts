// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { labelPaginationArrows } from '@/components/admin/providers/PaginationLabels/labels'

/**
 * The accessible names for Payload's pagination arrows (known upstream gap, see the component).
 * These are DOM tests: the component only exists to touch attributes on Payload's markup.
 */
describe('labelPaginationArrows', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('names left and right arrows that have no text', () => {
    document.body.innerHTML = `
      <div class="paginator">
        <button class="clickable-arrow clickable-arrow--left" type="button"><svg></svg></button>
        <button class="clickable-arrow clickable-arrow--right" type="button"><svg></svg></button>
      </div>`

    // The component passes Payload's `t`; the test passes the same catalogue, so the label text
    // stays covered together with the key lookup.
    const t = (key: string): string => {
      const [, path] = key.split(':')
      return path === 'pagination.previous' ? 'Previous page' : 'Next page'
    }
    labelPaginationArrows(document, t)

    expect(document.querySelector('.clickable-arrow--left')?.getAttribute('aria-label')).toBe(
      'Previous page',
    )
    expect(document.querySelector('.clickable-arrow--right')?.getAttribute('aria-label')).toBe(
      'Next page',
    )
  })

  it('leaves a name Payload (or a future version) already provides', () => {
    document.body.innerHTML = `
      <button class="clickable-arrow clickable-arrow--right" aria-label="Next" type="button"></button>
      <button class="clickable-arrow clickable-arrow--left" type="button">Back</button>`

    labelPaginationArrows(document)

    expect(document.querySelector('[aria-label="Next"]')).not.toBeNull()
    expect(document.querySelector('.clickable-arrow--left')?.hasAttribute('aria-label')).toBe(false)
  })

  it('ignores buttons that are not pagination arrows', () => {
    document.body.innerHTML = '<button type="button" class="btn"></button>'

    labelPaginationArrows(document)

    expect(document.querySelector('.btn')?.hasAttribute('aria-label')).toBe(false)
  })

  it('is idempotent', () => {
    document.body.innerHTML =
      '<button class="clickable-arrow clickable-arrow--right" type="button"></button>'
    const t = () => 'Next page'
    labelPaginationArrows(document, t)
    labelPaginationArrows(document, t)
    expect(document.querySelectorAll('[aria-label="Next page"]')).toHaveLength(1)
  })

  it('falls back to the key when no translator is given (SSR safety)', () => {
    document.body.innerHTML =
      '<button class="clickable-arrow clickable-arrow--left" type="button"></button>'
    labelPaginationArrows(document)
    expect(document.querySelector('.clickable-arrow--left')?.getAttribute('aria-label')).toBe(
      'custom:pagination.previous',
    )
  })
})
