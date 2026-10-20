import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { buttonVariants } from '@/components/admin/elements/Button'

import { ElementsLazy } from './ElementsLazy'
import {
  FieldsPreview,
  GraphicsPreview,
  ListPreview,
  ToolsPreview,
  WidgetsPreview,
} from './previews'
import { RegistryTables } from './Registry'
import { collectRegistry } from './registry'
import { GallerySection } from './Section'

const SECTIONS = [
  ['registry', 'Registered'],
  ['graphics', 'Graphics'],
  ['widgets', 'Widgets'],
  ['list', 'List view'],
  ['fields', 'Fields'],
  ['tools', 'Admin tools'],
  ['elements', 'Elements'],
] as const

/**
 * /admin/gallery (`admin.components.views.gallery`): every custom component this project plugs
 * into Payload, rendered live inside Payload's own shell and grouped like Payload's documentation.
 * The registry table is read from the running config; graphics, widgets, the list summary, field
 * components and cells are the real components with live or sample data. Server rendered; only
 * the building-block demos at the end are a client chunk, loaded on demand. Needs the Developer
 * tools capability (ADR 0011).
 */
export function GalleryView({
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps) {
  // Custom views get permissions, locale and visible entities only inside initPageResult.
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/gallery`)}`)
  }
  if (!hasCapability(req.user, 'useDeveloperTools')) notFound()

  const entries = collectRegistry(payload.config)

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      // Header actions (admin.components.actions, e.g. the theme switch): custom views pass them on.
      viewActions={viewActions}
      // A copy, as Payload's own views pass it (React 19 rejects the frozen original).
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <SetStepNav nav={[{ label: 'Component gallery' }]} />
        <div data-testid="gallery" className="acn:space-y-12 acn:pt-6 acn:pb-16">
          <header className="acn:space-y-4">
            <div className="acn:space-y-1">
              <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
                Component gallery
              </h1>
              <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
                Every custom component this admin plugs into Payload, live, grouped the way
                Payload&rsquo;s documentation groups them: root components, dashboard widgets,
                collection components and field components. Files live in{' '}
                <code className="acn:font-mono">src/components/admin/&lt;slot&gt;/</code>. Admins
                only.
              </p>
            </div>
            <nav aria-label="Gallery sections" className="acn:flex acn:flex-wrap acn:gap-2">
              {SECTIONS.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={buttonVariants({
                    size: 'sm',
                    variant: 'secondary',
                    className: 'acn:no-underline',
                  })}
                >
                  {label}
                </a>
              ))}
            </nav>
          </header>

          <GallerySection
            id="registry"
            title="Registered components"
            description={
              <>
                Read from the running Payload config, so it always matches what Payload renders. A
                Component Path is relative to{' '}
                <code className="acn:font-mono">importMap.baseDir</code> (
                <code className="acn:font-mono">src</code>); after adding or renaming one, run{' '}
                <code className="acn:font-mono">pnpm generate:importmap</code>.
              </>
            }
            docs={{
              href: 'https://payloadcms.com/docs/custom-components/overview#component-paths',
              label: 'Component paths',
            }}
          >
            <RegistryTables entries={entries} />
          </GallerySection>

          <GallerySection
            id="graphics"
            title="Graphics"
            description="Brand marks and the account avatar. Server components: no client JavaScript."
            docs={{
              href: 'https://payloadcms.com/docs/custom-components/root-components#graphicslogo',
              label: 'Root components: graphics',
            }}
          >
            {/* `user` is the read-filtered user (Payload docs: render that, keep req.user for access checks). */}
            <GraphicsPreview entries={entries} user={user} />
          </GallerySection>

          <GallerySection
            id="widgets"
            title="Dashboard widgets"
            description="Server components that read the Local API with your access rights; this is the data the dashboard shows you."
            docs={{
              href: 'https://payloadcms.com/docs/custom-components/dashboard',
              label: 'Dashboard widgets',
            }}
          >
            <WidgetsPreview entries={entries} initPageResult={initPageResult} />
          </GallerySection>

          <GallerySection
            id="list"
            title="List view"
            description="The collection list keeps Payload's toolbar, filters and pagination; the table is TanStack Table and a summary sits above it."
            docs={{
              href: 'https://payloadcms.com/docs/custom-components/list-view',
              label: 'List view',
            }}
          >
            <ListPreview entries={entries} initPageResult={initPageResult} />
          </GallerySection>

          <GallerySection
            id="fields"
            title="Field components"
            description="Custom inputs for the edit view and custom cells for list tables."
            docs={{
              href: 'https://payloadcms.com/docs/fields/overview#custom-components',
              label: 'Field components',
            }}
          >
            <FieldsPreview entries={entries} initPageResult={initPageResult} />
          </GallerySection>

          <GallerySection
            id="tools"
            title="Admin tools"
            description="Whole views and collections that are not components on a page: what each one is for, which capability opens it, and where it lives. The links are the real routes; a tool your role cannot open is not linked."
          >
            <ToolsPreview entries={entries} initPageResult={initPageResult} />
          </GallerySection>

          <GallerySection
            id="elements"
            title="Elements"
            description={
              <>
                The building blocks the components above are made of (
                <code className="acn:font-mono">src/components/admin/elements</code>, Base UI with{' '}
                <code className="acn:font-mono">acn:</code> Tailwind classes) and the design tokens.
                Loaded on demand.
              </>
            }
          >
            <ElementsLazy />
          </GallerySection>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default GalleryView
