import { describe, expect, it } from 'vitest'

import {
  buildMonthRange,
  formatCompact,
  formatCount,
  formatPercent,
  labelToString,
  monthKey,
  monthLabel,
  percentChange,
  relativeTime,
  titleFromSlug,
} from '@/admin-ui/tailadmin/lib/format'
import { buildNavGroups, flattenNavGroups } from '@/admin-ui/tailadmin/data/navGroups'
import { buildQuickActions } from '@/admin-ui/tailadmin/data/quickActions'
import { buildTailAdminComponents, resolvePilotMode } from '@/admin-ui/tailadmin/config'
import type { CollectionStat } from '@/admin-ui/tailadmin/data/types'

describe('admin-ui: lib/format', () => {
  it('formats counts with locale grouping', () => {
    expect(formatCount(1234567, 'en-US')).toBe('1,234,567')
    expect(formatCount(0, 'en-US')).toBe('0')
    expect(formatCount(null)).toBe('—')
    expect(formatCount(undefined)).toBe('—')
  })

  it('formats compact numbers', () => {
    expect(formatCompact(1234567, 'en-US')).toBe('1.2M')
    expect(formatCompact(999, 'en-US')).toBe('999')
  })

  it('computes percent change with a zero-safe baseline', () => {
    expect(percentChange(110, 100)).toBeCloseTo(10)
    expect(percentChange(90, 100)).toBeCloseTo(-10)
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(Number.NaN, 10)).toBeNull()
  })

  it('formats signed percentages and em-dash for null', () => {
    expect(formatPercent(10)).toBe('+10%')
    expect(formatPercent(-3.14159)).toBe('-3.1%')
    expect(formatPercent(null)).toBe('—')
  })

  it('derives UTC month keys and labels', () => {
    expect(monthKey('2026-10-12T23:59:00Z')).toBe('2026-10')
    expect(monthLabel('2026-10')).toBe('Oct 26')
  })

  it('builds a month range ending at the current month', () => {
    const anchor = new Date(Date.UTC(2026, 9, 12)) // 2026-10
    const range = buildMonthRange(3, anchor)
    expect(range).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('renders relative timestamps', () => {
    const now = new Date('2026-10-12T12:00:00Z')
    expect(relativeTime('2026-10-12T09:00:00Z', now)).toBe('3 hours ago')
    expect(relativeTime('2026-10-11T12:00:00Z', now)).toBe('yesterday')
    expect(relativeTime(null, now)).toBe('—')
  })

  it('titlecases slugs and resolves labels', () => {
    expect(titleFromSlug('media-with-prefix')).toBe('Media With Prefix')
    expect(labelToString('Projects', 'projects')).toBe('Projects')
    expect(labelToString({ en: 'Articles', fa: 'مقاله‌ها' }, 'articles')).toBe('Articles')
    expect(labelToString(undefined, 'experiences')).toBe('Experiences')
  })
})

describe('admin-ui: data/navGroups', () => {
  const entities = [
    { slug: 'projects', type: 'collection' as const, label: 'Projects' },
    { slug: 'articles', type: 'collection' as const, label: 'Articles', group: 'Content' },
    { slug: 'users', type: 'collection' as const, label: 'Users' },
    { slug: 'hidden-one', type: 'collection' as const, label: 'Hidden', hidden: true },
    { slug: 'footer', type: 'global' as const, label: 'Footer' },
  ]

  it('groups by admin.group and hides flagged entities', () => {
    const groups = buildNavGroups({ entities })
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('Menu')
    expect(labels).toContain('Content')
    const slugs = flattenNavGroups(groups).map((e) => e.slug)
    expect(slugs).not.toContain('hidden-one')
    expect(slugs).toContain('footer')
  })

  it('honours the canAccess filter', () => {
    const groups = buildNavGroups({
      entities,
      canAccess: (entity) => entity.slug !== 'users',
    })
    const slugs = flattenNavGroups(groups).map((e) => e.slug)
    expect(slugs).not.toContain('users')
  })

  it('builds correct hrefs for collections and globals', () => {
    const groups = buildNavGroups({ entities })
    const bySlug = new Map(flattenNavGroups(groups).map((e) => [e.slug, e]))
    expect(bySlug.get('projects')?.href).toBe('/admin/collections/projects')
    expect(bySlug.get('footer')?.href).toBe('/admin/globals/footer')
  })
})

describe('admin-ui: config', () => {
  it('enables the whole-admin TailAdmin theme by default', () => {
    expect(resolvePilotMode({ NODE_ENV: 'test' })).toBe('full')
  })

  it('supports explicit modes and falls back to full for unknown values', () => {
    expect(resolvePilotMode({ NODE_ENV: 'test', POCMS_ADMIN_UI: 'off' })).toBe('off')
    expect(resolvePilotMode({ NODE_ENV: 'test', POCMS_ADMIN_UI: 'additive' })).toBe('additive')
    expect(resolvePilotMode({ NODE_ENV: 'test', POCMS_ADMIN_UI: 'dashboard' })).toBe('dashboard')
    expect(resolvePilotMode({ NODE_ENV: 'test', POCMS_ADMIN_UI: 'unknown' })).toBe('full')
  })

  it('registers the global theme provider in full mode without replacing Payload Nav', () => {
    const components = buildTailAdminComponents('full')

    expect(components?.providers).toEqual([
      '/admin-ui/tailadmin/providers/TailAdminThemeProvider#TailAdminThemeProvider',
    ])
    expect(components).not.toHaveProperty('Nav')
    expect(components?.views).toHaveProperty('dashboard.Component')
  })
})

describe('admin-ui: data/quickActions', () => {
  const stat = (slug: string): CollectionStat => ({
    slug,
    label: `${slug}`,
    count: 1,
    href: `/admin/collections/${slug}`,
    type: 'collection',
    readable: true,
  })

  it('offers a create shortcut for readable, creatable collections', () => {
    const actions = buildQuickActions({
      collections: [stat('projects'), stat('articles')],
      permissions: { collections: { projects: { create: true, read: true } } },
      limit: 4,
    })
    // `projects` has an explicit create:true entry; `articles` has no entry in
    // the permissions map at all, which Payload uses to mean "no access", so it
    // is (correctly) excluded.
    expect(actions.map((a) => a.href)).toEqual(['/admin/collections/projects/create'])
  })

  it('excludes collections without create permission', () => {
    const actions = buildQuickActions({
      collections: [stat('projects')],
      permissions: { collections: { projects: { create: false, read: true } } },
    })
    expect(actions).toHaveLength(0)
  })

  it('respects the limit and labels singularly', () => {
    const actions = buildQuickActions({
      collections: [stat('projects'), stat('articles'), stat('services')],
      permissions: null,
      limit: 2,
    })
    expect(actions).toHaveLength(2)
    expect(actions[0].label).toBe('New project')
  })
})
