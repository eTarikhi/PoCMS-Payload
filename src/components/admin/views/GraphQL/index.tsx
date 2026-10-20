import type { DocumentViewServerProps } from 'payload'
import React from 'react'

import { GraphQLViewLazy } from './Lazy'
import { documentQuery, MAX_GRAPHQL_DEPTH } from './query'

/**
 * The **GraphQL** document tab (`admin.components.views.edit.graphql`, added to every collection and
 * global by adminUIPlugin), next to Payload's **API** tab and with the same options: draft, locale,
 * depth and authenticated. The server builds the query from Payload's own GraphQL schema (the one
 * /api/graphql serves); the client (a lazy chunk) runs it and shows the query, the variables, a
 * cURL command and the response.
 */
export function GraphQLDocumentView({ initPageResult, payload }: DocumentViewServerProps) {
  const { collectionConfig, globalConfig } = initPageResult
  const query = documentQuery({ collectionConfig, globalConfig, payload })
  const { defaultDepth, graphQL, localization, routes } = payload.config
  const playground =
    graphQL?.disablePlaygroundInProduction && process.env.NODE_ENV === 'production'
      ? null
      : `${routes.api}${routes.graphQLPlayground}`
  const localeOptions = localization
    ? localization.locales.map((locale) => ({
        label: typeof locale.label === 'string' ? locale.label : locale.code,
        value: locale.code,
      }))
    : null

  return (
    <GraphQLViewLazy
      defaultDepth={Math.min(defaultDepth ?? 2, MAX_GRAPHQL_DEPTH)}
      endpoint={`${routes.api}${routes.graphQL}`}
      localeOptions={localeOptions}
      maxDepth={MAX_GRAPHQL_DEPTH}
      playground={playground}
      query={query}
    />
  )
}

export default GraphQLDocumentView
