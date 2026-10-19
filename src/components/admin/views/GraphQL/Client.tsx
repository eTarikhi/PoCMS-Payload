'use client'

import {
  CheckboxField,
  Form,
  Gutter,
  NumberField,
  SelectField,
  SetDocumentStepNav,
  useConfig,
  useDocumentInfo,
  useLocale,
  useTranslation,
} from '@payloadcms/ui'
import { CheckIcon, CopyIcon } from 'lucide-react'
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/admin/elements/Button'
import { cn } from '@/components/admin/utilities/cn'

import type { GraphQLDocumentQuery } from './query'

type Props = {
  defaultDepth: number
  endpoint: string
  localeOptions: { label: string; value: string }[] | null
  maxDepth: number
  playground: string | null
  query: GraphQLDocumentQuery | null
}

type Result =
  | { state: 'loading' }
  | { state: 'done'; data: unknown; ms: number; status: number }
  | { state: 'failed'; message: string }

const noSubscription = () => () => {}

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

/** Pretty JSON with coloured tokens (keys, strings, numbers, literals); no dependencies. */
function JSONView({ label, value }: { label: string; value: unknown }) {
  const json = JSON.stringify(value, null, 2) ?? ''
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of json.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) parts.push(json.slice(last, index))
    const [token, string, colon, literal] = match
    const className = string
      ? colon
        ? 'acn:text-foreground acn:font-medium'
        : 'acn:text-success'
      : literal
        ? 'acn:text-warning'
        : 'acn:text-primary'
    parts.push(
      <span key={index} className={className}>
        {string ?? token}
      </span>,
    )
    if (colon) parts.push(colon)
    last = index + token.length
  }
  parts.push(json.slice(last))
  return (
    <pre tabIndex={0} aria-label={label} className={codeBlock}>
      {parts}
    </pre>
  )
}

const codeBlock =
  'acn:m-0 acn:max-h-[70vh] acn:overflow-auto acn:rounded-md acn:border acn:border-border acn:bg-card acn:p-3 acn:font-mono acn:text-xs acn:leading-relaxed acn:whitespace-pre acn:outline-none acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50'

/** A labelled copy button (Payload's CopyToClipboard is an unnamed icon button). */
function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true))
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
      {copied ? 'Copied' : label}
    </Button>
  )
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

function GraphQLInspector({
  defaultDepth,
  endpoint,
  localeOptions,
  maxDepth,
  playground,
  query,
}: Props & { query: GraphQLDocumentQuery }) {
  const { id, collectionSlug, globalSlug, initialData, isTrashed } = useDocumentInfo()
  const { i18n, t } = useTranslation()
  const { code } = useLocale()
  const {
    config: { serverURL },
    getEntityConfig,
  } = useConfig()
  const collectionConfig = collectionSlug ? getEntityConfig({ collectionSlug }) : undefined
  const globalConfig = globalSlug ? getEntityConfig({ globalSlug }) : undefined

  const [draft, setDraft] = useState(false)
  const [authenticated, setAuthenticated] = useState(true)
  const [locale, setLocale] = useState(code)
  const [depth, setDepth] = useState(defaultDepth)
  // The origin is read on the client only, as Payload's API tab does, so hydration matches.
  const origin = useSyncExternalStore(
    noSubscription,
    () => serverURL || window.location.origin,
    () => serverURL || '',
  )
  const [response, setResponse] = useState<{ key: string; result: Result } | null>(null)

  const text = query.queries[Math.max(0, Math.min(depth, maxDepth))]
  const trashed = Boolean(isTrashed ?? typeof initialData?.deletedAt === 'string')
  const variables = useMemo(
    () => ({
      ...(query.idType && id !== undefined
        ? {
            id:
              query.idType.startsWith('Int') || query.idType.startsWith('Float')
                ? Number(id)
                : String(id),
          }
        : {}),
      ...(query.args.draft ? { draft } : {}),
      ...(query.args.locale ? { locale } : {}),
      ...(query.args.trash ? { trash: trashed } : {}),
    }),
    [draft, id, locale, query, trashed],
  )
  const body = useMemo(() => JSON.stringify({ query: text, variables }), [text, variables])
  const url = `${origin}${endpoint}`

  // One request per option change; a newer request aborts the older one. Until its answer
  // arrives the response shows as running (derived from the request key, no extra state).
  const requestKey = `${authenticated}|${i18n.language}|${body}`
  useEffect(() => {
    const controller = new AbortController()
    const started = performance.now()
    fetch(endpoint, {
      body,
      credentials: authenticated ? 'include' : 'omit',
      headers: { 'Accept-Language': i18n.language, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (res) => {
        const data: unknown = await res.json()
        setResponse({
          key: requestKey,
          result: {
            data,
            ms: Math.round(performance.now() - started),
            state: 'done',
            status: res.status,
          },
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setResponse({
          key: requestKey,
          result: {
            message: error instanceof Error ? error.message : String(error),
            state: 'failed',
          },
        })
      })
    return () => controller.abort()
  }, [authenticated, body, endpoint, i18n.language, requestKey])
  const result: Result = response?.key === requestKey ? response.result : { state: 'loading' }

  const curl = [
    `curl ${shellQuote(url)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    ...(authenticated ? [`  -H 'Authorization: JWT <your token>' \\`] : []),
    `  --data-raw ${shellQuote(body)}`,
  ].join('\n')
  const errors =
    result.state === 'done' &&
    Array.isArray((result.data as { errors?: unknown[] } | null)?.errors) &&
    ((result.data as { errors: unknown[] }).errors.length ?? 0) > 0

  return (
    <Gutter className="query-inspector graphql-inspector" right={false}>
      <SetDocumentStepNav
        collectionSlug={collectionSlug}
        globalLabel={globalConfig?.label}
        globalSlug={globalSlug}
        id={id}
        isTrashed={isTrashed}
        pluralLabel={collectionConfig?.labels?.plural}
        useAsTitle={collectionConfig?.admin?.useAsTitle}
        view="GraphQL"
      />
      <div className="query-inspector__configuration">
        <div className="query-inspector__api-url">
          <span className="query-inspector__label acn:flex acn:items-center acn:gap-2">
            GraphQL endpoint <CopyButton label="Copy URL" value={url} />
          </span>
          <span>
            <span className="acn:font-mono acn:text-xs acn:text-muted-foreground">POST</span> {url}
          </span>
          {playground ? (
            <a href={playground} rel="noopener noreferrer" target="_blank">
              Open GraphQL Playground<span className="acn:sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
        <Form
          initialState={{
            authenticated: { initialValue: authenticated, valid: true, value: authenticated },
            depth: { initialValue: depth, valid: true, value: depth },
            draft: { initialValue: draft, valid: true, value: draft },
            locale: { initialValue: locale, valid: true, value: locale },
          }}
        >
          <div className="query-inspector__form-fields">
            <div className="query-inspector__filter-query-checkboxes">
              {query.args.draft ? (
                <CheckboxField
                  field={{ name: 'draft', label: t('version:draft') }}
                  onChange={() => setDraft(!draft)}
                  path="draft"
                />
              ) : null}
              <CheckboxField
                field={{ name: 'authenticated', label: t('authentication:authenticated') }}
                onChange={() => setAuthenticated(!authenticated)}
                path="authenticated"
              />
            </div>
            {localeOptions && query.args.locale ? (
              <SelectField
                field={{ name: 'locale', label: t('general:locale'), options: localeOptions }}
                onChange={(value) => setLocale(String(value ?? code))}
                path="locale"
              />
            ) : null}
            <NumberField
              // Payload's client field type wants every admin key; its API tab passes these same ones.
              field={
                {
                  name: 'depth',
                  admin: { step: 1 },
                  label: t('general:depth'),
                  max: maxDepth,
                  min: 0,
                } as React.ComponentProps<typeof NumberField>['field']
              }
              onChange={(value) => setDepth(Number(value ?? 0))}
              path="depth"
            />
          </div>
        </Form>
      </div>

      {/* The results column of Payload's query inspector (configuration left, results right). */}
      <div className="acn:mt-10 acn:grid acn:w-full acn:min-w-0 acn:gap-6 acn:pr-(--gutter-h) acn:pb-10 acn:2xl:grid-cols-2">
        <section aria-labelledby="graphql-query-title" className="acn:min-w-0">
          <div className="acn:mb-2 acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
            <h2 id="graphql-query-title" className="acn:m-0 acn:text-base acn:font-semibold">
              Query
            </h2>
            <span className="acn:flex acn:items-center acn:gap-2">
              <CopyButton label="Copy query" value={text} />
              <CopyButton label="Copy as cURL" value={curl} />
            </span>
          </div>
          <p className="acn:mt-0 acn:mb-2 acn:text-sm acn:text-muted-foreground">
            Built from Payload&apos;s GraphQL schema. Depth sets how far relationships are expanded:
            at 0 they select only their id.
          </p>
          <pre
            tabIndex={0}
            aria-label="GraphQL query"
            className={cn(codeBlock, 'acn:max-h-[45vh]')}
          >
            {text}
          </pre>
          <h3 className="acn:mt-4 acn:mb-2 acn:text-sm acn:font-semibold">Variables</h3>
          <JSONView label="Query variables" value={variables} />
        </section>

        <section aria-labelledby="graphql-response-title" className="acn:min-w-0">
          <div className="acn:mb-2 acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
            <h2 id="graphql-response-title" className="acn:m-0 acn:text-base acn:font-semibold">
              Response
            </h2>
            <span
              role="status"
              className={cn(
                'acn:text-sm',
                errors || result.state === 'failed'
                  ? 'acn:text-destructive'
                  : 'acn:text-muted-foreground',
              )}
            >
              {result.state === 'loading'
                ? 'Running…'
                : result.state === 'failed'
                  ? `Request failed: ${result.message}`
                  : `${result.status}${errors ? ' with errors' : ''} · ${result.ms} ms`}
            </span>
          </div>
          {result.state === 'done' ? (
            <JSONView label="GraphQL response" value={result.data} />
          ) : (
            <pre aria-hidden="true" className={cn(codeBlock, 'acn:text-muted-foreground')}>
              {result.state === 'loading' ? '…' : ''}
            </pre>
          )}
        </section>
      </div>
    </Gutter>
  )
}

export function GraphQLViewClient(props: Props) {
  if (!props.query) {
    return (
      <Gutter>
        <p className="acn:text-sm acn:text-muted-foreground">
          GraphQL is turned off for this collection or global, so there is no query to show.
        </p>
      </Gutter>
    )
  }
  return <GraphQLInspector {...props} query={props.query} />
}
