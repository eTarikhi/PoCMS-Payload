import type {
  AdminViewServerProps,
  BeforeListTableServerProps,
  CollectionSlug,
  DefaultCellComponentProps,
  Field,
  FormState,
  InitPageResult,
  SelectField,
  SelectFieldClientProps,
  WidgetServerProps,
} from 'payload'
import { Form } from '@payloadcms/ui'
import Link from 'next/link'
import React from 'react'

import { buttonVariants } from '@/components/admin/elements/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { BooleanCell } from '@/components/admin/fields/Checkbox/Cell'
import { ContextColorCell } from '@/components/admin/fields/ContextColor/Cell'
import { ContextColorField } from '@/components/admin/fields/ContextColor/Field'
import { FileSizeCell } from '@/components/admin/fields/FileSize/Cell'
import { ProgressCell } from '@/components/admin/fields/Progress/Cell'
import { IconCell } from '@/components/admin/fields/ServiceIcon/Cell'
import { ServiceIconField } from '@/components/admin/fields/ServiceIcon/Field'
import { AccountAvatar } from '@/components/admin/graphics/AccountAvatar'
import { Icon } from '@/components/admin/graphics/Icon'
import { Logo } from '@/components/admin/graphics/Logo'
import { ListSummary } from '@/components/admin/views/List/ListSummary'
import { CIStatusView, CIStatusWidget } from '@/components/admin/widgets/CIStatus'
import { ContentCountWidget } from '@/components/admin/widgets/ContentCount'
import { ContentHealthWidget } from '@/components/admin/widgets/ContentHealth'
import { PublishingActivityWidget } from '@/components/admin/widgets/PublishingActivity'
import { RecentChangesWidget } from '@/components/admin/widgets/RecentChanges'
import { DeploymentsView, DeploymentsWidget } from '@/components/admin/widgets/Deployments'
import { PageSpeedReportView, PageSpeedWidget } from '@/components/admin/widgets/PageSpeed'
import { SiteTrafficWidget, TrafficReportView } from '@/components/admin/widgets/SiteTraffic'
import { WelcomeWidget } from '@/components/admin/widgets/Welcome'

import { SAMPLE_CI, SAMPLE_DEPLOYMENTS, SAMPLE_FIELD, SAMPLE_LAB, SAMPLE_TRAFFIC } from './samples'
import type { RegistryEntry } from './registry'
import { ComponentPath, Specimen } from './Section'

/** The registered Component Path of an export (captions come from the config, not copies). */
const pathFinder = (entries: RegistryEntry[]) => (exportName: string) =>
  entries.find((entry) => entry.path.endsWith(`#${exportName}`))?.path

export function GraphicsPreview({
  entries,
  user,
}: {
  entries: RegistryEntry[]
  user: AdminViewServerProps['user']
}) {
  const find = pathFinder(entries)
  // The avatar is typed with all server props; it reads only `user`.
  const avatar = (sample: Record<string, unknown> | null | undefined) =>
    ({ user: sample }) as unknown as React.ComponentProps<typeof AccountAvatar>
  return (
    <div className="acn:grid acn:gap-4 acn:md:grid-cols-3">
      <Specimen title="Logo" path={find('Logo')} meta="graphics.Logo: the login screen">
        <Logo />
      </Specimen>
      <Specimen title="Icon" path={find('Icon')} meta="graphics.Icon: sidebar and breadcrumbs">
        <Icon />
      </Specimen>
      <Specimen
        title="Account avatar"
        path={find('AccountAvatar')}
        meta="avatar.Component: you, a name, an e-mail address only"
      >
        <div className="acn:flex acn:items-center acn:gap-3">
          <AccountAvatar {...avatar(user as unknown as Record<string, unknown>)} />
          <AccountAvatar {...avatar({ name: 'Jane Doe' })} />
          <AccountAvatar {...avatar({ email: 'sam.lee@example.com' })} />
        </div>
      </Specimen>
    </div>
  )
}

/** The dashboard widgets, rendered with the live data the dashboard would show you. */
export function WidgetsPreview({
  entries,
  initPageResult,
}: {
  entries: RegistryEntry[]
  initPageResult: InitPageResult
}) {
  const find = pathFinder(entries)
  const { cookies, locale, permissions, req } = initPageResult
  const props = (widgetSlug: string, widgetData?: Record<string, unknown>): WidgetServerProps => ({
    cookies,
    locale,
    permissions,
    req,
    user: req.user ?? undefined,
    widgetData,
    widgetSlug,
  })
  const sizes = (slug: string) => {
    const widget = req.payload.config.admin.dashboard?.widgets.find((w) => w.slug === slug)
    return `${slug} · ${widget?.minWidth ?? 'x-small'} to ${widget?.maxWidth ?? 'full'}`
  }
  return (
    <div className="acn:grid acn:gap-4 acn:lg:grid-cols-3">
      <Specimen
        title="Content count"
        path={find('ContentCountWidget')}
        meta={`${sizes('content-count')} · widget data: { collection }`}
      >
        <div className="acn:grid acn:gap-3">
          <ContentCountWidget {...props('content-count', { collection: 'articles' })} />
          <ContentCountWidget {...props('content-count', { collection: 'media' })} />
        </div>
      </Specimen>
      <Specimen
        title="Needs attention"
        path={find('ContentHealthWidget')}
        meta={sizes('content-health')}
      >
        <ContentHealthWidget {...props('content-health')} />
      </Specimen>
      <Specimen title="Welcome" path={find('WelcomeWidget')} meta={sizes('welcome')}>
        <WelcomeWidget {...props('welcome')} />
      </Specimen>
      <Specimen
        title="Publishing activity"
        path={find('PublishingActivityWidget')}
        meta={`${sizes('publishing-activity')} · the chart is a lazily loaded client island`}
        className="acn:lg:col-span-2"
      >
        <PublishingActivityWidget {...props('publishing-activity')} />
      </Specimen>
      <Specimen
        title="Recent changes"
        path={find('RecentChangesWidget')}
        meta={sizes('recent-changes')}
      >
        <RecentChangesWidget {...props('recent-changes')} />
      </Specimen>
      <Specimen
        title="Site traffic"
        path={find('SiteTrafficWidget')}
        meta={`${sizes('site-traffic')} · widget data: { period } · capability: viewAnalytics · live, then sample data`}
        className="acn:lg:col-span-3"
      >
        <div className="acn:grid acn:gap-3 acn:lg:grid-cols-2">
          <SiteTrafficWidget {...props('site-traffic', { period: '7' })} />
          <TrafficReportView
            report={SAMPLE_TRAFFIC}
            links={{ '/articles/sample-article': { href: '#', title: 'Sample article' } }}
            siteURL=""
          />
        </div>
      </Specimen>
      <Specimen
        title="Page speed"
        path={find('PageSpeedWidget')}
        meta={`${sizes('page-speed')} · widget data: { formFactor } · capability: viewAnalytics · live, then sample data`}
        className="acn:lg:col-span-3"
      >
        <div className="acn:grid acn:gap-3 acn:lg:grid-cols-2">
          <PageSpeedWidget {...props('page-speed', { formFactor: 'PHONE' })} />
          <PageSpeedReportView
            lab={SAMPLE_LAB}
            field={SAMPLE_FIELD}
            origin="https://example.com"
            formFactor="PHONE"
            language={req.i18n.language}
          />
        </div>
      </Specimen>
      <Specimen
        title="Deployments"
        path={find('DeploymentsWidget')}
        meta={`${sizes('deployments')} · capability: viewDeployments · live, then sample data`}
        className="acn:lg:col-span-3"
      >
        <div className="acn:grid acn:gap-3 acn:lg:grid-cols-2">
          <DeploymentsWidget {...props('deployments')} />
          <DeploymentsView deployments={SAMPLE_DEPLOYMENTS} language={req.i18n.language} />
        </div>
      </Specimen>
      <Specimen
        title="CI status"
        path={find('CIStatusWidget')}
        meta={`${sizes('ci-status')} · capability: viewDeployments · live, then sample data`}
        className="acn:lg:col-span-3"
      >
        <div className="acn:grid acn:gap-3 acn:lg:grid-cols-2">
          <CIStatusWidget {...props('ci-status')} />
          <CIStatusView report={SAMPLE_CI} language={req.i18n.language} />
        </div>
      </Specimen>
    </div>
  )
}

/** The list summary as it renders above the Articles table, plus links to the lists themselves. */
export function ListPreview({
  entries,
  initPageResult,
}: {
  entries: RegistryEntry[]
  initPageResult: InitPageResult
}) {
  const find = pathFinder(entries)
  const { req } = initPageResult
  const admin = req.payload.config.routes.admin
  const summaryProps = {
    collectionSlug: 'articles',
    i18n: req.i18n,
    params: {},
    payload: req.payload,
    user: req.user,
  } as unknown as BeforeListTableServerProps
  const lists: [CollectionSlug, string][] = [
    ['articles', 'Articles'],
    ['media', 'Media (phone cards with thumbnails)'],
    ['skills', 'Skills (progress and colour cells)'],
  ]
  return (
    <div className="acn:grid acn:items-start acn:gap-4 acn:lg:grid-cols-3">
      <Specimen
        title="List summary"
        path={find('ListSummary')}
        meta="beforeListTable on every collection (adminUI plugin); shown for Articles"
        className="acn:lg:col-span-2"
      >
        <ListSummary {...summaryProps} />
      </Specimen>
      <Specimen
        title="TanStack list view"
        path={find('TanStackListView')}
        meta="views.list.Component: a page of its own, so it is linked rather than embedded"
      >
        <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:gap-2 acn:p-0">
          {lists.map(([slug, label]) => (
            <li key={slug}>
              <Link
                href={`${admin}/collections/${slug}`}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: 'acn:no-underline',
                })}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </Specimen>
    </div>
  )
}

function findField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    const nested =
      'fields' in field && Array.isArray(field.fields)
        ? findField(field.fields, name)
        : field.type === 'tabs'
          ? findField(
              field.tabs.flatMap((tab) => tab.fields),
              name,
            )
          : undefined
    if (nested) return nested
  }
  return undefined
}

/** A select field from a collection, reduced to the serializable client shape a Field component gets. */
function clientSelect(
  fields: Field[] | undefined,
  name: string,
): SelectFieldClientProps['field'] | undefined {
  const field = fields ? (findField(fields, name) as SelectField | undefined) : undefined
  if (!field || field.type !== 'select') return undefined
  return {
    name: field.name,
    type: 'select',
    label: typeof field.label === 'string' ? field.label : field.name,
    options: field.options.map((option) =>
      typeof option === 'string'
        ? { label: option, value: option }
        : {
            label: typeof option.label === 'string' ? option.label : option.value,
            value: option.value,
          },
    ),
    required: field.required,
    admin: {
      description:
        typeof field.admin?.description === 'string' ? field.admin.description : undefined,
    },
  } as SelectFieldClientProps['field']
}

/** Sample values per cell, rendered by the real Cell components. */
const CELL_SAMPLES: { title: string; exportName: string; samples: unknown[] }[] = [
  { title: 'Checkbox', exportName: 'BooleanCell', samples: [true, false, null] },
  {
    title: 'Context colour',
    exportName: 'ContextColorCell',
    samples: ['primary', 'success', 'warning', ''],
  },
  { title: 'File size', exportName: 'FileSizeCell', samples: [512, 341_586, 5_400_000, null] },
  { title: 'Progress', exportName: 'ProgressCell', samples: [25, 80, 100] },
  { title: 'Service icon', exportName: 'IconCell', samples: ['faCode', 'faLaptopCode', ''] },
]

const CELLS: Record<string, React.ComponentType<DefaultCellComponentProps>> = {
  BooleanCell,
  ContextColorCell,
  FileSizeCell,
  IconCell,
  ProgressCell,
}

/** Cells get the field and row too; these previews only need `cellData`. */
const cellProps = (cellData: unknown) =>
  ({
    cellData,
    collectionSlug: 'gallery',
    field: { name: 'value', type: 'text' },
    rowData: {},
  }) as unknown as DefaultCellComponentProps

/**
 * Field components inside a real Payload <Form>, so `useField` works as in the edit view (pick a tile
 * to change the value), and every list Cell with sample values.
 */
export function FieldsPreview({
  entries,
  initPageResult,
}: {
  entries: RegistryEntry[]
  initPageResult: InitPageResult
}) {
  const find = pathFinder(entries)
  const { payload } = initPageResult.req
  const color = clientSelect(payload.collections.skills?.config.fields, 'color')
  const icon = clientSelect(payload.collections.services?.config.fields, 'iconFont')
  const initialState: FormState = {
    color: { initialValue: 'primary', valid: true, value: 'primary' },
    iconFont: { initialValue: 'faCode', valid: true, value: 'faCode' },
  }
  const fieldProps = (field: SelectFieldClientProps['field'], path: string) =>
    ({ field, path, schemaPath: path }) as SelectFieldClientProps

  return (
    <div className="acn:space-y-4">
      <Form initialState={initialState}>
        <div className="acn:grid acn:gap-4 acn:lg:grid-cols-2">
          {color ? (
            <Specimen
              title="Context colour picker"
              path={find('ContextColorField')}
              meta="Field on Skills › color: the stored value stays the option value"
            >
              <ContextColorField {...fieldProps(color, 'color')} />
            </Specimen>
          ) : null}
          {icon ? (
            <Specimen
              title="Service icon picker"
              path={find('ServiceIconField')}
              meta="Field on Services › iconFont: Font Awesome loads only where it renders"
            >
              <ServiceIconField {...fieldProps(icon, 'iconFont')} />
            </Specimen>
          ) : null}
        </div>
      </Form>
      <Specimen
        title="List cells"
        meta="Cell components with sample values; '-' marks an empty value"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cell</TableHead>
              <TableHead>Component path</TableHead>
              <TableHead>Samples</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CELL_SAMPLES.map(({ title, exportName, samples }) => {
              const Cell = CELLS[exportName]
              return (
                <TableRow key={exportName}>
                  <TableCell className="acn:font-medium">{title}</TableCell>
                  <TableCell className="acn:whitespace-normal">
                    <ComponentPath path={find(exportName) ?? '-'} className="acn:text-xs" />
                  </TableCell>
                  <TableCell>
                    <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-x-6 acn:gap-y-2">
                      {samples.map((sample, i) => (
                        <span key={i} data-cell-sample={exportName}>
                          <Cell {...cellProps(sample)} />
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Specimen>
    </div>
  )
}
