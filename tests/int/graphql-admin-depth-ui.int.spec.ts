import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', async () => {
  const { createElement } = await import('react')
  const Empty = () => null
  const Container = ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children)
  const SelectField = ({
    field,
    onChange,
  }: {
    field: { label: string; options?: { label: string; value: string }[] }
    onChange?: (value: unknown) => void
  }) =>
    createElement(
      'label',
      null,
      field.label,
      createElement(
        'select',
        {
          'aria-label': field.label,
          onChange: (event: { target: { value: string } }) => onChange?.(event.target.value),
          value: field.options?.[0]?.value,
        },
        field.options?.map((option) =>
          createElement('option', { key: option.value, value: option.value }, option.label),
        ),
      ),
    )

  return {
    CheckboxField: Empty,
    Form: Container,
    Gutter: Container,
    SelectField,
    SetDocumentStepNav: Empty,
    useConfig: () => ({
      config: { serverURL: 'https://cms.example.test' },
      getEntityConfig: () => undefined,
    }),
    useDocumentInfo: () => ({
      id: 1,
      collectionSlug: 'projects',
      initialData: {},
      isTrashed: false,
    }),
    useLocale: () => ({ code: 'en' }),
    useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
  }
})

import { GraphQLViewClient } from '@/components/admin/views/GraphQL/Client'
import type { GraphQLDocumentQuery } from '@/components/admin/views/GraphQL/query'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Admin GraphQL depth UI', () => {
  it('offers only production-valid depths and defaults to the nearest valid shallower query', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ data: {} }), status: 200 }),
    )
    const query: GraphQLDocumentQuery = {
      field: 'Project',
      queries: Array.from(
        { length: 6 },
        (_, depth) => `query ProjectDepth${depth} { Project { id } }`,
      ),
      selectableDepths: [0, 1, 2],
      depthValidation: Array.from({ length: 6 }, (_, depth) => ({
        depth,
        errors: depth <= 2 ? [] : ['Query rejected by production validation.'],
        valid: depth <= 2,
      })),
      args: { draft: false, fallbackLocale: false, locale: false, trash: false },
      idType: 'Int!',
    }

    render(
      React.createElement(GraphQLViewClient, {
        defaultDepth: 5,
        endpoint: '/api/graphql',
        localeOptions: null,
        playground: null,
        query,
      }),
    )

    const depthOptions = screen
      .getByRole('combobox', { name: 'general:depth' })
      .querySelectorAll('option')
    expect([...depthOptions].map(({ value }) => value)).toEqual(['0', '1', '2'])
    expect(screen.getByLabelText('GraphQL query').textContent).toContain('query ProjectDepth2')
  })

  it('shows every validation reason when no depth passes production validation', () => {
    const messages = [
      'The query exceeds the maximum complexity of 1. Actual complexity is 110',
      'Independent production rule failure.',
    ]
    const query: GraphQLDocumentQuery = {
      field: 'Article',
      queries: Array.from(
        { length: 6 },
        (_, depth) => `query ArticleDepth${depth} { Article { id } }`,
      ),
      selectableDepths: [],
      depthValidation: Array.from({ length: 6 }, (_, depth) => ({
        depth,
        errors: messages,
        valid: false,
      })),
      args: { draft: false, fallbackLocale: false, locale: false, trash: false },
      idType: 'Int!',
    }

    render(
      React.createElement(GraphQLViewClient, {
        defaultDepth: 2,
        endpoint: '/api/graphql',
        localeOptions: null,
        playground: null,
        query,
      }),
    )

    expect(screen.getByRole('status').textContent).toContain(
      'No generated GraphQL query depth passes the production validation rules.',
    )
    expect(screen.getByText(`Depth 0: ${messages.join('; ')}`)).toBeDefined()
    expect(screen.getByText(`Depth 5: ${messages.join('; ')}`)).toBeDefined()
  })
})
